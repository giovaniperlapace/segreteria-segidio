"use server";

import { requireManager } from "@/lib/auth/profile";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type EmailBatchPreviewMessage = {
  id: number;
  to_email: string;
  contact_name: string;
  institution: string | null;
  subject: string;
  rendered_text: string;
  status: "queued" | "sending" | "sent" | "failed" | "skipped";
  sent_at: string | null;
  error_message: string | null;
};

const EMAIL_DELIVERY_STATUSES = ["queued", "sending", "sent", "failed", "skipped"] as const;
export type EmailDeliveryStatus = (typeof EMAIL_DELIVERY_STATUSES)[number];

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
  statuses?: EmailDeliveryStatus[],
): Promise<EmailBatchPreviewResult> {
  await requireManager();
  if (!Number.isSafeInteger(eventId) || eventId <= 0 || !Number.isSafeInteger(batchId) || batchId <= 0) {
    return { status: "error", message: "Blocco email non valido." };
  }
  if (statuses && statuses.some((status) => !EMAIL_DELIVERY_STATUSES.includes(status))) {
    return { status: "error", message: "Filtro email non valido." };
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

    let logsQuery = supabase
      .from("email_logs")
      .select(
        "id,to_email,subject,rendered_text,status,sent_at,error_message,contacts(first_name,last_name,institution)",
        { count: "exact" },
      )
      .eq("batch_id", batchId)
      .eq("event_id", eventId);
    if (statuses && statuses.length > 0) {
      logsQuery = logsQuery.in("status", statuses);
    }
    const { data, error, count } = await logsQuery.order("id").limit(500);
    if (error) throw error;

    return {
      status: "success",
      total: count ?? data?.length ?? 0,
      messages: (data ?? []).map((message) => {
        const contact = Array.isArray(message.contacts)
          ? message.contacts[0]
          : message.contacts;
        const contactName = [contact?.first_name, contact?.last_name]
          .filter(Boolean)
          .join(" ")
          .trim();
        return {
          id: Number(message.id),
          to_email: String(message.to_email),
          contact_name: contactName || "Contatto senza nome",
          institution: contact?.institution ? String(contact.institution) : null,
          subject: String(message.subject),
          rendered_text: String(message.rendered_text),
          status: message.status as EmailBatchPreviewMessage["status"],
          sent_at: message.sent_at,
          error_message: message.error_message,
        };
      }),
    };
  } catch (error) {
    console.error("Could not load email batch preview", error);
    return { status: "error", message: "Impossibile caricare i dettagli delle email." };
  }
}
