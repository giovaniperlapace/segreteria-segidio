import { evidence, saveEvidence, validSecret } from '@/lib/email/delivery-evidence';
import { getEmailConfig } from '@/lib/email/config';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!validSecret(request.headers.get('x-postmark-webhook-secret'), process.env.POSTMARK_WEBHOOK_SECRET)) return new Response('Unauthorized', { status: 401 });
  // No message bodies are requested from Postmark; cap the actual stream, not just Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return new Response('Invalid body', { status: 400 });
  let body = '';
  const decoder = new TextDecoder();
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 65536) { await reader.cancel(); return new Response('Too large', { status: 413 }); }
    body += decoder.decode(value, { stream: true });
  }
  body += decoder.decode();
  let payload;
  try { payload = JSON.parse(body); } catch { return new Response('Invalid JSON', { status: 400 }); }
  if (!payload || typeof payload !== 'object') return new Response('Invalid payload', { status: 400 });
  if (payload.MessageStream !== getEmailConfig().broadcastStream) return Response.json({ ignored: true });
  const kind = payload.RecordType === 'Delivery' ? 'Delivered' : payload.RecordType === 'Bounce' ? 'Bounced' : payload.RecordType;
  if (!['Delivered', 'Bounced', 'SpamComplaint'].includes(kind)) return Response.json({ ignored: true });
  const row = evidence(String(payload.MessageID ?? ''), String(payload.Recipient ?? payload.Email ?? ''), kind,
    String(payload.DeliveredAt ?? payload.BouncedAt ?? ''), String(payload.Details ?? payload.Description ?? ''));
  if (!row) return new Response('Invalid event', { status: 400 });
  try {
    const db = createSupabaseServiceClient();
    const logId = Number(payload.Metadata?.email_log_id);
    let query = db.from('email_logs').select('id,to_email,provider_message_id');
    // Metadata permits events that arrive before the acceptance write finishes.
    query = Number.isSafeInteger(logId) && logId > 0 ? query.eq('id', logId) : query.eq('provider_message_id', row.provider_message_id);
    const { data: logs, error } = await query;
    if (error) throw new Error('lookup_failed');
    if (!logs?.some(log => log.to_email.toLowerCase() === row.recipient && (!log.provider_message_id || log.provider_message_id === row.provider_message_id))) return Response.json({ ignored: true });
    await saveEvidence([row]);
    return Response.json({ ok: true });
  } catch { return new Response('Persistence unavailable', { status: 503 }); } // Let Postmark retry until durably saved.
}
