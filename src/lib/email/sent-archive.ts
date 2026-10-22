import { completeOriginal, restoreArchiveOriginal } from './archive-original';
import { randomUUID } from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { createSupabaseServiceClient } from '../supabase/service';
import { DEFAULT_EMAIL_FROM } from './config';
import { isPostmarkId, postmarkRead, syncDeliveryEvidence } from './delivery-evidence';

export function archiveClient() {
  const user = process.env.GMAIL_USER?.trim();
  if (user?.toLowerCase() !== DEFAULT_EMAIL_FROM || !process.env.GMAIL_APP_PASSWORD) throw new Error('archive_configuration_missing');
  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user, pass: process.env.GMAIL_APP_PASSWORD }, logger: false,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000, disableAutoIdle: true });
  client.on('error', () => {}); // Never log protocol data, credentials or original messages.
  return client;
}
export function originalHeaders(raw: string) {
  const header = raw.split(/\r?\n\r?\n/, 1)[0].replace(/\r?\n[ \t]+/g, ' ');
  const messageId = /^Message-ID:\s*(<[^\r\n<>]+>)/im.exec(header)?.[1];
  const date = /^Date:\s*(.+)$/im.exec(header)?.[1];
  if (!messageId || !date || !Number.isFinite(Date.parse(date))) throw new Error('original_headers_missing');
  return { messageId, originalDate: new Date(date).toISOString() };
}
// No SMTP, no send API: this function only stores an existing original in Sent.
export async function appendOriginal(client: ImapFlow, raw: string) {
  if (!completeOriginal(raw)) throw new Error('archive_original_incomplete');
  const { messageId, originalDate } = originalHeaders(raw);
  const sent = (await client.list()).find(folder => folder.specialUse === '\\Sent');
  if (!sent) throw new Error('sent_folder_missing');
  const lock = await client.getMailboxLock(sent.path);
  try {
    const existing = await client.search({ header: { 'Message-ID': messageId } }, { uid: true });
    if (!existing) throw new Error('archive_search_failed');
    if (existing.length) return { mailbox: sent.path, mailbox_uid: existing[0], message_id: messageId, original_date: originalDate };
    const result = await client.append(sent.path, Buffer.from(raw), ['\\Seen'], new Date(originalDate));
    if (!result) throw new Error('archive_append_unknown');
    // Read back: APPEND acknowledgement alone is not our completion criterion.
    const confirmed = await client.search({ header: { 'Message-ID': messageId } }, { uid: true });
    if (!confirmed || !confirmed.length) throw new Error('archive_readback_pending');
    return { mailbox: sent.path, mailbox_uid: confirmed[0], message_id: messageId, original_date: originalDate };
  } finally { lock.release(); }
}

export async function processSentArchives(options: { logId?: number; limit?: number } = {}) {
  if (process.env.EMAIL_SENT_ARCHIVE_ENABLED !== 'true') return { archived: 0, failed: 0, disabled: true };
  const db = createSupabaseServiceClient();
  const now = new Date().toISOString();
  let query = db.from('email_sent_archives').select('email_log_id,provider_message_id,status,attempts')
    .neq('status', 'archived').lte('next_attempt_at', now).or(`lease_until.is.null,lease_until.lt.${now}`).order('next_attempt_at').limit(Math.min(options.limit ?? 25, 25));
  if (options.logId) query = query.eq('email_log_id', options.logId);
  else query = query.eq('recovered', false); // Historical recovery has its own bandwidth-limited scheduler.
  const { data: jobs, error } = await query;
  if (error) throw new Error('archive_queue_unavailable');
  let archived = 0, failed = 0;
  const started = Date.now();
  for (const job of jobs ?? []) {
    if (Date.now() - started > 180000) break;
    const token = randomUUID();
    const { data: claimed, error: claimError } = await db.from('email_sent_archives').update({ status: 'processing', lease_token: token,
      lease_until: new Date(Date.now() + 600000).toISOString(), attempts: job.attempts + 1 })
      .eq('email_log_id', job.email_log_id).neq('status', 'archived').or(`lease_until.is.null,lease_until.lt.${now}`).select('email_log_id').maybeSingle();
    if (claimError) throw new Error('archive_claim_failed');
    if (!claimed) continue;
    let client: ImapFlow | undefined;
    try {
      const { data: log, error: logError } = await db.from('email_logs').select('to_email,status,provider_message_id').eq('id', job.email_log_id).single();
      if (logError || log?.status !== 'sent' || log.provider_message_id !== job.provider_message_id || !isPostmarkId(job.provider_message_id)) throw new Error('archive_log_mismatch');
      const { data: snapshot, error: readError } = await db.from('email_sent_archives').select('raw_message').eq('email_log_id', job.email_log_id).single();
      if (readError) throw new Error('archive_snapshot_failed');
      let raw: string | null = snapshot?.raw_message ?? null;
      if (!raw || !completeOriginal(raw)) {
        await syncDeliveryEvidence(job.provider_message_id, log.to_email);
        const dump = await postmarkRead(`messages/outbound/${job.provider_message_id}/dump`);
        if (typeof dump.Body !== 'string' || !dump.Body.trim()) throw new Error('postmark_original_unavailable');
        const body: string = dump.Body;
        raw = await restoreArchiveOriginal(job.email_log_id, job.provider_message_id, body, originalHeaders(body));
        const headers = originalHeaders(raw);
        const { error: snapshotError } = await db.from('email_sent_archives').update({ raw_message: raw, message_id: headers.messageId, original_date: headers.originalDate }).eq('email_log_id', job.email_log_id).eq('lease_token', token);
        if (snapshotError) throw new Error('archive_snapshot_failed');
      }
      if (!raw) throw new Error('postmark_original_unavailable');
      client = archiveClient();
      // Hard bound is shorter than the DB lease, including an unresponsive IMAP server.
      const deadline = setTimeout(() => client?.close(), 60000);
      let result;
      try { await client.connect(); result = await appendOriginal(client, raw); }
      finally { clearTimeout(deadline); client.close(); }
      const { error: finishError } = await db.from('email_sent_archives').update({ ...result, status: 'archived', archived_at: new Date().toISOString(), last_error: null, lease_token: null, lease_until: null }).eq('email_log_id', job.email_log_id).eq('lease_token', token);
      if (finishError) throw new Error('archive_finish_failed');
      archived++;
    } catch (cause) {
      client?.close();
      // Do not disclose IMAP responses: error codes are deliberately allowlisted.
      const code = cause instanceof Error && /^(archive_|postmark_|original_headers_|sent_folder_|evidence_)[a-z_]+$/.test(cause.message) ? cause.message : 'archive_connection_failed';
      const { error: failureError } = await db.from('email_sent_archives').update({ status: 'failed', last_error: code, lease_token: null, lease_until: null,
        next_attempt_at: new Date(Date.now() + Math.min(86400000, 600000 * 2 ** Math.min(job.attempts, 7))).toISOString() }).eq('email_log_id', job.email_log_id).eq('lease_token', token);
      if (failureError) throw new Error('archive_failure_save_failed');
      failed++;
    }
  }
  return { archived, failed, disabled: false };
}
