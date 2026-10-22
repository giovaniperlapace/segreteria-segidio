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
