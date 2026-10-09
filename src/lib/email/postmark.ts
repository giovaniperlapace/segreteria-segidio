// Server-side Postmark HTTP transport. Never fall back to SMTP after an uncertain outcome.
import { getEmailConfig } from "./config";
import { batchFailure, retryAfterSeconds, type BatchFailure } from "./batch-outcome";

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string | null;
  metadata?: Record<string, string>;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
    cid?: string;
  }>;
};

export class EmailDeliveryError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = "EmailDeliveryError";
  }
}

export function sendTransactionalEmail(input: SendEmailInput) {
  return sendEmail(input, "transactional");
}

export function sendBroadcastEmail(input: SendEmailInput) {
  return sendEmail(input, "broadcast");
}

async function sendEmail(input: SendEmailInput, kind: "transactional" | "broadcast") {
  const config = getEmailConfig();
  // Each call represents exactly one recipient. Prevent accidental recipient expansion.
  if (!/^[^\s,;<>@]+@[^\s,;<>@]+$/.test(input.to)) {
    throw new EmailDeliveryError("invalid_recipient");
  }
  const body = JSON.stringify(postmarkPayload(input, kind, config));
  if (Buffer.byteLength(body) > 9_000_000) throw new EmailDeliveryError("postmark_message_too_large");
  let response: Response;
  try {
    response = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Postmark-Server-Token": config.serverToken,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // The provider may have accepted the message before the connection failed.
    // Do not retry automatically, either here or using another provider.
    throw new EmailDeliveryError("postmark_delivery_unknown");
  }
  let result: { ErrorCode?: number; MessageID?: string };
  try { result = await response.json(); }
  catch { throw new EmailDeliveryError("postmark_response_unknown"); }
  if (!response.ok || result?.ErrorCode !== 0) {
    const code = Number.isInteger(result?.ErrorCode) ? result.ErrorCode : response.status;
    throw new EmailDeliveryError(`postmark_${code}`);
  }
  if (typeof result.MessageID !== "string" || !result.MessageID.trim()) {
    throw new EmailDeliveryError("postmark_response_unknown");
  }
  return { messageId: result.MessageID };
}

function postmarkPayload(input: SendEmailInput, kind: "transactional" | "broadcast", config: ReturnType<typeof getEmailConfig>) {
  return {
        From: config.from,
        ReplyTo: config.replyTo,
        To: input.to,
        Subject: input.subject,
        TextBody: kind === "broadcast" ? `${input.text}\n\nPer non ricevere altri inviti: {{{ pm:unsubscribe }}}` : input.text,
        HtmlBody: input.html ? (kind === "broadcast" ? `${input.html}<p style="font-size:12px;color:#667085"><a href="{{{ pm:unsubscribe }}}">Non ricevere altri inviti</a></p>` : input.html) : undefined,
        Metadata: input.metadata,
        MessageStream: kind === "broadcast" ? config.broadcastStream : config.transactionalStream,
        TrackOpens: false,
        TrackLinks: "None",
        Attachments: input.attachments?.map(attachment => ({
          Name: attachment.filename,
          Content: attachment.content.toString("base64"),
          ContentType: attachment.contentType,
          ...(attachment.cid ? { ContentID: `cid:${attachment.cid.replace(/^cid:/, "")}` } : {}),
        })),
      };
}

export type BatchEmailResult = { messageId: string; errorCode?: never; disposition?: never; retryAfterSeconds?: never } | BatchFailure;

// Bound encoded JSON bytes as well as message count (attachments expand in base64).
export async function sendBroadcastBatch(inputs: SendEmailInput[]): Promise<BatchEmailResult[]> {
  const config = getEmailConfig();
  const results: BatchEmailResult[] = [];
  let pending: string[] = [];
  let indexes: number[] = [];
  let bytes = 2;
  let stopped = false;
  async function flush() {
    if (!pending.length) return;
    let values: BatchEmailResult[];
    try {
      const response = await fetch("https://api.postmarkapp.com/email/batch", {
        method: "POST", redirect: "error",
        headers: { "Content-Type": "application/json", Accept: "application/json", "X-Postmark-Server-Token": config.serverToken },
        body: `[${pending.join(",")}]`, signal: AbortSignal.timeout(20_000),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const failure = batchFailure(response.status, data?.ErrorCode);
        const delay = retryAfterSeconds(response.headers.get("retry-after"));
        values = indexes.map(() => ({ ...failure, ...(delay ? { retryAfterSeconds: delay } : {}) }));
      } else if (!Array.isArray(data) || data.length !== indexes.length) {
        values = indexes.map(() => ({ errorCode: "postmark_response_unknown", disposition: "unknown" }));
      } else {
        values = data.map(item => item?.ErrorCode === 0 && typeof item.MessageID === "string" && item.MessageID.trim()
          ? { messageId: item.MessageID }
          : Number.isInteger(item?.ErrorCode) && item.ErrorCode !== 0
            ? batchFailure(response.status, item.ErrorCode)
            : { errorCode: "postmark_response_unknown", disposition: "unknown" });
      }
    } catch {
      // Never resubmit an ambiguous request: some or all messages may be accepted.
      values = indexes.map(() => ({ errorCode: "postmark_delivery_unknown", disposition: "unknown" }));
    }
    indexes.forEach((index, offset) => { results[index] = values[offset]; });
    stopped ||= values.some(value => Boolean(value.disposition));
    pending = []; indexes = []; bytes = 2;
  }
  for (const [index, input] of inputs.entries()) {
    if (stopped) {
      results[index] = { errorCode: "postmark_batch_deferred", disposition: "retry" }; continue;
    }
    if (!/^[^\s,;<>@]+@[^\s,;<>@]+$/.test(input.to)) {
      results[index] = { errorCode: "invalid_recipient" }; continue;
    }
    const payload = JSON.stringify(postmarkPayload(input, "broadcast", config));
    const size = Buffer.byteLength(payload);
    // Conservative margin below Postmark's per-message and 50 MB batch limits.
    if (size > 9_000_000) { results[index] = { errorCode: "postmark_message_too_large" }; continue; }
    if (pending.length && (pending.length === 500 || bytes + size + 1 > 10_000_000)) await flush();
    if (stopped) {
      results[index] = { errorCode: "postmark_batch_deferred", disposition: "retry" }; continue;
    }
    pending.push(payload); indexes.push(index); bytes += size + 1;
  }
  await flush();
  return results;
}
