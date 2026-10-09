export const DEFAULT_EMAIL_FROM = "segreteriagenerale@santegidio.org";

export type EmailConfig = {
  from: string;
  replyTo: string;
  serverToken: string;
  transactionalStream: string;
  broadcastStream: string;
};

export function getEmailConfig(): EmailConfig {
  const serverToken = process.env.POSTMARK_SERVER_TOKEN?.trim() || "";
  if (!serverToken) {
    throw new Error("Missing POSTMARK_SERVER_TOKEN");
  }
  if (process.env.NODE_ENV === "production" && serverToken === "POSTMARK_API_TEST") {
    throw new Error("Postmark test token is not allowed in production");
  }
  const transactionalStream = process.env.POSTMARK_TRANSACTIONAL_STREAM?.trim() || "outbound";
  const broadcastStream = process.env.POSTMARK_BROADCAST_STREAM?.trim() || "broadcast";
  if (transactionalStream === broadcastStream) {
    throw new Error("Postmark transactional and broadcast streams must be separate");
  }
  return {
    from: process.env.EMAIL_FROM?.trim() || DEFAULT_EMAIL_FROM,
    replyTo: process.env.EMAIL_REPLY_TO?.trim() || DEFAULT_EMAIL_FROM,
    serverToken,
    transactionalStream,
    broadcastStream,
  };
}
