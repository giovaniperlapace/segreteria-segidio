import MailComposer from 'nodemailer/lib/mail-composer';
import { createSupabaseServiceClient } from '../supabase/service';
import { syncDeliveryEvidence } from './delivery-evidence';

export function completeOriginal(raw: string) {
  if (raw.includes('[MESSAGE TRUNCATED]')) return false;
  const head = raw.split(/\r?\n\r?\n/, 1)[0].replace(/\r?\n[ \t]+/g, ' ');
  const type = /^Content-Type:\s*(.+)$/im.exec(head)?.[1] ?? '';
  if (!/^multipart\//i.test(type)) return true;
  const boundary = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(type);
  return Boolean(boundary && raw.includes(`--${boundary[1] ?? boundary[2]}--`));
}

// Postmark truncates MIME dumps at 512 KiB. Recover only from verified provider
// bodies and the immutable attachments saved for the original batch; never invent content.
export async function restoreArchiveOriginal(logId: number, providerId: string, raw: string, original: { messageId: string; originalDate: string }) {
  if (completeOriginal(raw)) return raw;
  const db = createSupabaseServiceClient();
  const { data: log, error } = await db.from('email_logs').select('batch_id,to_email,subject').eq('id', logId).single();
  if (error || !log) throw new Error('archive_original_incomplete');
  const details = await syncDeliveryEvidence(providerId, log.to_email);
  if (details.Subject !== log.subject || typeof details.TextBody !== 'string' || details.TextBody.includes('[MESSAGE TRUNCATED]') || String(details.HtmlBody ?? '').includes('[MESSAGE TRUNCATED]')) throw new Error('archive_original_incomplete');
  const { data: links, error: attachmentsError } = await db.from('email_batch_attachments').select('email_attachments(file_name,content_type,content_base64,file_size_bytes)').eq('batch_id', log.batch_id);
  if (attachmentsError) throw new Error('archive_attachments_unavailable');
  const attachments = (links ?? []).flatMap(link => {
    const a = Array.isArray(link.email_attachments) ? link.email_attachments[0] : link.email_attachments;
    if (!a) return [];
    const content = Buffer.from(a.content_base64, 'base64');
    if (content.length !== a.file_size_bytes) throw new Error('archive_attachment_size_mismatch');
    return [{ filename: a.file_name as string, contentType: a.content_type as string, content }];
  });
  const names = details.Attachments;
  if (!Array.isArray(names) || names.some(name => typeof name !== 'string') || JSON.stringify([...names].sort()) !== JSON.stringify(attachments.map(a => a.filename).sort())) throw new Error('archive_attachment_mismatch');
  const headers = raw.split(/\r?\n\r?\n/, 1)[0].replace(/\r?\n[ \t]+/g, ' ');
  const header = (name: string) => new RegExp(`^${name}:\\s*(.+)$`, 'im').exec(headers)?.[1];
  const mime = await new MailComposer({
    from: details.From, to: log.to_email, replyTo: header('Reply-To'), subject: details.Subject,
    date: new Date(original.originalDate),
    // A recovered MIME representation has its own ID and preserves the original ID explicitly.
    messageId: `<archive.${providerId}@archivio-segreteria.segidio.org>`,
    text: details.TextBody, html: details.HtmlBody || undefined, attachments,
    headers: {
      'X-Original-Message-ID': original.messageId,
      'X-Archive-Reconstructed': 'Postmark bodies and original batch attachments',
      ...(header('List-Unsubscribe') ? { 'List-Unsubscribe': header('List-Unsubscribe')! } : {}),
      ...(header('List-Unsubscribe-Post') ? { 'List-Unsubscribe-Post': header('List-Unsubscribe-Post')! } : {}),
    },
  }).compile().build();
  const result = mime.toString('utf8');
  if (!completeOriginal(result)) throw new Error('archive_original_incomplete');
  return result;
}
