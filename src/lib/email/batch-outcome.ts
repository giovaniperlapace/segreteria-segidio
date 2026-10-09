export type BatchFailure = {
  errorCode: string;
  disposition?: "retry" | "unknown" | "blocked";
  retryAfterSeconds?: number;
  messageId?: never;
};

// HTTP status and Postmark ErrorCode are different namespaces (e.g. 413).
export function batchFailure(status: number, code?: number): BatchFailure {
  const errorCode = `postmark_${Number.isInteger(code) ? code : status}`;
  if (status === 429 || code === 100) return { errorCode, disposition: "retry" };
  // A gateway/500 error does not prove that Postmark rejected the message.
  if (status >= 500 || code === 101) return { errorCode, disposition: "unknown" };
  if (status === 401 || status === 403 || [10, 405, 412, 413, 422, 1235, 1236, 1480].includes(code ?? -1)) {
    return { errorCode, disposition: "blocked" };
  }
  return { errorCode };
}

export function retryAfterSeconds(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = /^\d+$/.test(value) ? Number(value) : (Date.parse(value) - now) / 1000;
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(86400, Math.ceil(seconds)) : undefined;
}
