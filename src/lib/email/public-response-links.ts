import { createHash, randomBytes } from "crypto";

export const PUBLIC_RESPONSE_STATUSES = ["attending", "declined", "maybe"] as const;

export type PublicResponseStatus = (typeof PUBLIC_RESPONSE_STATUSES)[number];

export const PUBLIC_RESPONSE_LABELS: Record<PublicResponseStatus, string> = {
  attending: "Partecipo",
  declined: "Non partecipo",
  maybe: "Probabilmente partecipo",
};

export function appBaseUrl() {
  const configuredUrl = process.env.APP_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/+$/, "");

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}

export function createPublicResponseToken() {
  return randomBytes(32).toString("base64url");
}

export function hashPublicResponseToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function publicResponseUrl(token: string) {
  return `${appBaseUrl()}/risposta/${encodeURIComponent(token)}`;
}

export function appAbsoluteUrl(path: string) {
  return `${appBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

export function publicResponseStatus(value: string): PublicResponseStatus | null {
  return PUBLIC_RESPONSE_STATUSES.includes(value as PublicResponseStatus)
    ? (value as PublicResponseStatus)
    : null;
}

export function appendPublicResponseLink(input: {
  text: string;
  html: string | null;
  responseUrl: string;
}) {
  const text = [
    input.text.trimEnd(),
    "",
    "Per comunicare la sua risposta puo' usare questo link personale:",
    input.responseUrl,
  ].join("\n");

  const button = `
    <div style="margin: 28px 0; padding: 20px; border: 1px solid #d9e1f2; border-radius: 12px; background: #f8fafc;">
      <p style="margin: 0 0 14px; color: #172033;">Per comunicare la sua risposta puo' usare questo link personale:</p>
      <a href="${input.responseUrl}" style="background: #1b3272; color: #ffffff; padding: 12px 18px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 700;">
        Comunica la risposta
      </a>
    </div>
  `;

  return {
    text,
    html: input.html ? `${input.html}\n${button}` : button,
  };
}
