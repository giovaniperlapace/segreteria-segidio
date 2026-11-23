import "server-only";
import { getEmailConfig } from "./config";
import { extractRecipients } from "./invitation-recipients";

type Suppression = {
  EmailAddress: string;
  CreatedAt: string;
  SuppressionReason: string;
  Origin: string;
};

export async function invitationUnsubscriptions() {
  const { serverToken, broadcastStream } = getEmailConfig();
  const url = new URL(`https://api.postmarkapp.com/message-streams/${encodeURIComponent(broadcastStream)}/suppressions/dump`);
  url.searchParams.set("Origin", "Recipient");
  url.searchParams.set("SuppressionReason", "ManualSuppression");
  const response = await fetch(url, {
    headers: { Accept: "application/json", "X-Postmark-Server-Token": serverToken },
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error("Elenco disiscrizioni non disponibile");
  const data: { Suppressions: Suppression[] } = await response.json();
  const entries = data.Suppressions.filter(row => row.Origin === "Recipient" && row.SuppressionReason === "ManualSuppression");
  return new Map(entries.map(row => [row.EmailAddress.trim().toLowerCase(), row.CreatedAt]));
}

export function unsubscribedAddresses(contact: { email: string | null; email_2: string | null }, entries: Map<string, string>) {
  return extractRecipients(contact.email, contact.email_2).map(email => email.toLowerCase()).filter(email => entries.has(email));
}
