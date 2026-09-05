import { createHash, randomBytes } from "crypto";

export const PUBLIC_RESPONSE_STATUSES = ["attending", "declined", "maybe"] as const;

export type PublicResponseStatus = (typeof PUBLIC_RESPONSE_STATUSES)[number];

export const PUBLIC_RESPONSE_CHOICES = ["attending", "declined", "delegated", "maybe"] as const;

export type PublicResponseChoice = (typeof PUBLIC_RESPONSE_CHOICES)[number];

export const PUBLIC_RESPONSE_LABELS: Record<PublicResponseStatus, string> = {
  attending: "Partecipo",
  declined: "Non partecipo",
  maybe: "Probabilmente partecipo",
};

export const PUBLIC_RESPONSE_CHOICE_LABELS: Record<PublicResponseChoice, string> = {
  ...PUBLIC_RESPONSE_LABELS,
  delegated: "Non partecipo e delego una persona al mio posto",
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

export function publicResponseChoice(value: string): PublicResponseChoice | null {
  return PUBLIC_RESPONSE_CHOICES.includes(value as PublicResponseChoice)
    ? (value as PublicResponseChoice)
    : null;
}

function publicResponseLinkBlocks(responseUrl: string) {
  const text = [
    "Per comunicare la sua risposta puo' usare questo link personale:",
    responseUrl,
  ].join("\n");
  const html = `
    <div style="margin: 28px 0; padding: 20px; border: 1px solid #d9e1f2; border-radius: 12px; background: #f8fafc;">
      <p style="margin: 0 0 14px; color: #172033;">Per comunicare la sua risposta puo' usare questo link personale:</p>
      <a href="${responseUrl}" style="background: #1b3272; color: #ffffff; padding: 12px 18px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 700;">
        Comunica la risposta
      </a>
    </div>
  `;

  return { text, html };
}

export function removePublicResponseLink(input: {
  text: string;
  html: string | null;
  responseUrl: string | null;
}) {
  if (!input.responseUrl) return { text: input.text, html: input.html };

  const blocks = publicResponseLinkBlocks(input.responseUrl);
  const textSuffix = `\n\n${blocks.text}`;
  const htmlSuffix = `\n${blocks.html}`;

  return {
    text: input.text.endsWith(textSuffix)
      ? input.text.slice(0, -textSuffix.length)
      : input.text,
    html:
      input.html === blocks.html
        ? null
        : input.html?.endsWith(htmlSuffix)
          ? input.html.slice(0, -htmlSuffix.length)
          : input.html,
  };
}

export function appendPublicResponseLink(input: {
  text: string;
  html: string | null;
  responseUrl: string;
}) {
  const base = removePublicResponseLink(input);
  const blocks = publicResponseLinkBlocks(input.responseUrl);
  const text = [base.text.trimEnd(), "", blocks.text].join("\n");

  return {
    text,
    html: base.html ? `${base.html}\n${blocks.html}` : blocks.html,
  };
}
