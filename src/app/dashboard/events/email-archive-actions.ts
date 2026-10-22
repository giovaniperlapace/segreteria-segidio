'use server';
import { requireManager } from '@/lib/auth/profile';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { isPostmarkId, syncDeliveryEvidence } from '@/lib/email/delivery-evidence';
import { processSentArchives } from '@/lib/email/sent-archive';

export async function recoverSentEmailAction(eventId: number, logId: number) {
  await requireManager();
  if (![eventId, logId].every(id => Number.isSafeInteger(id) && id > 0)) return { error: 'Messaggio non valido.' };
  try {
    const db = createSupabaseServiceClient();
    const { data: log, error } = await db.from('email_logs').select('id,to_email,status,provider_message_id').eq('id', logId).eq('event_id', eventId).single();
    if (error || log?.status !== 'sent' || !log.provider_message_id || !isPostmarkId(log.provider_message_id)) return { error: 'Questo messaggio non ha un invio Postmark verificabile.' };
    // Explicit recovery of older messages is distinguished from automatic archiving.
    const { error: queueError } = await db.from('email_sent_archives').upsert({ email_log_id: logId, provider_message_id: log.provider_message_id, recovered: true }, { onConflict: 'email_log_id', ignoreDuplicates: true });
    if (queueError) throw new Error('queue_failed');
    // Refresh evidence even when the Gmail copy already exists. A retained copy remains
    // available if the Postmark activity has expired; preserve that outcome separately.
    let evidenceUpdated = true;
    try { await syncDeliveryEvidence(log.provider_message_id, log.to_email); } catch { evidenceUpdated = false; }
    const result = await processSentArchives({ logId, limit: 1 });
    const { data: archive, error: archiveError } = await db.from('email_sent_archives').select('status,next_attempt_at').eq('email_log_id', logId).single();
    if (archiveError) throw archiveError;
    if (result.disabled) return { error: 'Archiviazione Gmail non ancora attivata. Gli esiti disponibili sono stati aggiornati.' };
    if (archive?.status === 'archived') return { message: evidenceUpdated ? 'Copia presente nella Posta inviata. Esiti aggiornati.' : 'Copia presente nella Posta inviata. Postmark non rende più disponibili gli esiti o è temporaneamente irraggiungibile.' };
    return { error: 'Copia non ancora archiviata. Riprova il recupero più tardi; nessuna email è stata reinviata.' };
  } catch { return { error: 'Recupero temporaneamente non disponibile. Nessuna email è stata reinviata.' }; }
}
