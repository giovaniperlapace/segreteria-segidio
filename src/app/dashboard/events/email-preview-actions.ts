"use server";

import { requireManager } from "@/lib/auth/profile";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type EmailBatchPreviewMessage = {
  id: number;
  to_email: string;
  subject: string;
  rendered_text: string;
  status: "queued" | "sending" | "sent" | "failed" | "skipped";
  sent_at: string | null;
  error_message: string | null;
};

export type EmailBatchPreviewResult =
  | {
      status: "success";
      total: number;
      messages: EmailBatchPreviewMessage[];
    }
  | {
      status: "error";
      message: string;
    };

export async function getEmailBatchPreviewAction(
  eventId: number,
  batchId: number,
): Promise<EmailBatchPreviewResult> {
  await requireManager();
  if (!Number.isSafeInteger(eventId) || eventId <= 0 || !Number.isSafeInteger(batchId) || batchId <= 0) {
    return { status: "error", message: "Blocco email non valido." };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { data: batch, error: batchError } = await supabase
      .from("email_batches")
      .select("id")
      .eq("id", batchId)
      .eq("event_id", eventId)
      .maybeSingle();
    if (batchError) throw batchError;
    if (!batch) return { status: "error", message: "Blocco email non trovato." };

    const { data, error, count } = await supabase
      .from("email_logs")
      .select("id,to_email,subject,rendered_text,status,sent_at,error_message", { count: "exact" })
      .eq("batch_id", batchId)
      .eq("event_id", eventId)
      .order("id")
      .limit(500);
    if (error) throw error;

    return {
      status: "success",
      total: count ?? data?.length ?? 0,
      messages: (data ?? []).map((message) => ({
        id: Number(message.id),
        to_email: String(message.to_email),
        subject: String(message.subject),
        rendered_text: String(message.rendered_text),
        status: message.status as EmailBatchPreviewMessage["status"],
        sent_at: message.sent_at,
        error_message: message.error_message,
      })),
    };
  } catch (error) {
    console.error("Could not load email batch preview", error);
    return { status: "error", message: "Impossibile caricare il testo delle email." };
  }
}
