import type { EmailTemplateContext } from "@/lib/email/templates";
import type { PartResponse } from "@/lib/invitations/event-parts";

export function extractRecipients(...values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const emails = values
    .flatMap((value) => value?.split(/[;,]/) ?? [])
    .map((item) => item.trim())
    .filter((item) => /^[^\s,;<>@]+@[^\s,;<>@]+\.[^\s,;<>@]+$/.test(item))
    .filter((item) => {
      const normalized = item.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  return emails;
}

export function invitationRecipients(
  row: { part_responses: PartResponse[]; delegate_email?: string | null },
  contact: { email?: string | null; email_2?: string | null },
  partIds: string[],
) {
  const parts = row.part_responses ?? [];
  const delegateValues = parts.length
    ? parts.filter(part => part.response === "delegated" && (!partIds.length || partIds.includes(part.id))).map(part => part.email)
    : [row.delegate_email];
  // A supplied but invalid delegate address must not silently redirect to the contact.
  const supplied = delegateValues.filter(value => value?.trim());
  return supplied.length ? extractRecipients(...supplied) : extractRecipients(contact.email, contact.email_2);
}

/** Personalize each delivery using the delegate matching its address and event part. */
export function invitationRecipientContact(
  row: { part_responses: PartResponse[]; delegate_email?: string | null; delegate_first_name?: string | null; delegate_last_name?: string | null; delegate_role?: string | null },
  contact: EmailTemplateContext["contact"],
  partIds: string[],
  recipient: string,
): EmailTemplateContext["contact"] {
  const matches = (email?: string | null) => extractRecipients(email).some(value => value.toLowerCase() === recipient.toLowerCase());
  const parts = row.part_responses ?? [];
  const delegate = parts.length
    ? parts.find(part => part.response === "delegated" && (!partIds.length || partIds.includes(part.id)) && matches(part.email))
    : matches(row.delegate_email)
      ? { firstName: row.delegate_first_name, lastName: row.delegate_last_name, role: row.delegate_role }
      : undefined;
  if (!delegate) return contact;
  return {
    first_name: delegate.firstName ?? null,
    last_name: delegate.lastName ?? null,
    institutional_role: delegate.role ?? null,
    institutional_role_invitation: null,
    honorific_title: null,
    honorific_title_invitation: null,
    institution: null,
    legacy_salutation: null,
    email: recipient,
    email_2: null,
  };
}
