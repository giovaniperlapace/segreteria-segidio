import { createHash, timingSafeEqual } from "node:crypto";
import { getEmailConfig } from "./config";
import { createSupabaseServiceClient } from "../supabase/service";

export const isPostmarkId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function validSecret(actual: string | null, expected: string | undefined) {
  if (!actual || !expected || expected.length < 32) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export type DeliveryEvidence = { provider_message_id: string; recipient: string; kind: string; occurred_at: string; details: string };
export function evidence(messageId: string, recipient: string, kind: string, date: string, details: string): DeliveryEvidence | null {
  if (!isPostmarkId(messageId) || !['Delivered','Bounced','SpamComplaint'].includes(kind) || !recipient || !Number.isFinite(Date.parse(date))) return null;
  return { provider_message_id: messageId, recipient: recipient.trim().toLowerCase(), kind, occurred_at: new Date(date).toISOString(), details: details.slice(0, 4000) };
}
export async function saveEvidence(events: DeliveryEvidence[]) {
  if (!events.length) return;
  const rows = events.map(event => ({ ...event, event_key: createHash('sha256').update(JSON.stringify([event.provider_message_id, event.recipient, event.kind, event.occurred_at])).digest('hex') }));
  const { error } = await createSupabaseServiceClient().from('email_delivery_events').upsert(rows, { onConflict: 'event_key', ignoreDuplicates: true });
  if (error) throw new Error('evidence_save_failed');
}
export async function postmarkRead(path: string) {
  const response = await fetch(`https://api.postmarkapp.com/${path}`, { headers: { Accept: 'application/json', 'X-Postmark-Server-Token': getEmailConfig().serverToken }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(response.status === 404 || response.status === 422 ? 'postmark_original_unavailable' : 'postmark_read_failed');
  return response.json();
}
export async function syncDeliveryEvidence(messageId: string, recipient: string) {
  if (!isPostmarkId(messageId)) throw new Error('invalid_postmark_id');
  const details = await postmarkRead(`messages/outbound/${messageId}/details`);
  if (details.MessageID !== messageId || !Array.isArray(details.To) || !details.To.some((to: { Email: string }) => to.Email?.toLowerCase() === recipient.toLowerCase())) throw new Error('postmark_recipient_mismatch');
  const rows: DeliveryEvidence[] = [];
  for (const item of details.MessageEvents ?? []) {
    if (String(item.Recipient).toLowerCase() !== recipient.toLowerCase()) continue;
    const row = evidence(messageId, recipient, item.Type, item.ReceivedAt, String(item.Details?.DeliveryMessage ?? item.Details?.Summary ?? ''));
    if (row) rows.push(row);
  }
  await saveEvidence(rows);
  return details;
}
