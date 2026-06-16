export type EmailTemplateContext = {
  event: {
    title: string;
    starts_at: string;
    location: string | null;
  };
  contact: {
    first_name: string | null;
    last_name: string | null;
    honorific_title: string | null;
    honorific_title_invitation: string | null;
    institutional_role: string | null;
    institutional_role_invitation: string | null;
    institution: string | null;
    legacy_salutation: string | null;
    email: string | null;
    email_2: string | null;
  };
};

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function normalizeTemplateLineBreaks(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n");
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function plainTextToHtml(value: string) {
  return normalizeTemplateLineBreaks(value)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

export function renderEmailTemplate(template: string, context: EmailTemplateContext) {
  const normalizedTemplate = normalizeTemplateLineBreaks(template);
  const firstName = context.contact.first_name?.trim() ?? "";
  const lastName = context.contact.last_name?.trim() ?? "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || context.contact.institution || "";
  const role = context.contact.institutional_role_invitation || context.contact.institutional_role || "";
  const title = context.contact.honorific_title_invitation || context.contact.honorific_title || "";
  const salutation = context.contact.legacy_salutation || (fullName ? `Gentile ${fullName}` : "Gentile");
  const values: Record<string, string> = {
    titolo_evento: context.event.title,
    data_evento: formatEventDate(context.event.starts_at),
    luogo_evento: context.event.location || "",
    nome: firstName,
    cognome: lastName,
    nome_completo: fullName,
    titolo_invito: title,
    carica: role,
    istituzione: context.contact.institution || "",
    email: context.contact.email || context.contact.email_2 || "",
    saluto: salutation,
    oggi: new Intl.DateTimeFormat("it-IT", { dateStyle: "long" }).format(new Date()),
  };

  return normalizedTemplate.replace(VARIABLE_PATTERN, (_match, key: string) => values[key] ?? "");
}

export const EMAIL_TEMPLATE_VARIABLES = [
  "titolo_evento",
  "data_evento",
  "luogo_evento",
  "nome",
  "cognome",
  "nome_completo",
  "titolo_invito",
  "carica",
  "istituzione",
  "email",
  "saluto",
  "oggi",
] as const;
