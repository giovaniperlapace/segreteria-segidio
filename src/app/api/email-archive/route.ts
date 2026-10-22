import { validSecret } from '@/lib/email/delivery-evidence';
import { processSentArchives } from '@/lib/email/sent-archive';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(request: Request) {
  if (!validSecret(request.headers.get('authorization'), process.env.EMAIL_ARCHIVE_CRON_SECRET ? `Bearer ${process.env.EMAIL_ARCHIVE_CRON_SECRET}` : undefined)) return new Response('Unauthorized', { status: 401 });
  try { return Response.json(await processSentArchives()); }
  catch { return new Response('Archive temporarily unavailable', { status: 503 }); }
}
