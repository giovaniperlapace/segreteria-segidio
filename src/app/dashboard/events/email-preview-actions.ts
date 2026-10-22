"use server";

import { fetchSupabaseRowsForIds } from "@/lib/supabase/fetch-all";
import { requireManager } from "@/lib/auth/profile";
import { removePublicResponseLink } from "@/lib/email/public-response-links";
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
  archive_status: string | null;
  archive_recovered: boolean;
  archive_error: string | null;
  delivery_events: Array<{ kind: string; occurred_at: string; details: string }>;
  provider_message_id: string | null;
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
        "id,invitation_id,to_email,subject,rendered_text,response_url,status,sent_at,error_message,provider_message_id,contacts(first_name,last_name,institution)",
        { count: "exact" },
      )
      .eq("batch_id", batchId)
      .eq("event_id", eventId);
    if (statuses && statuses.length > 0) {
      logsQuery = logsQuery.in("status", statuses);
    }
    const { data, error, count } = await logsQuery.order("id").limit(500);
    if (error) throw error;

    const ids = (data ?? []).map(row => row.id);
    const providerIds = (data ?? []).map(row => row.provider_message_id).filter(Boolean);
    const [archives, delivery] = await Promise.all([
      ids.length ? supabase.from('email_sent_archives').select('email_log_id,status,recovered,last_error').in('email_log_id', ids) : { data: [], error: null },
      providerIds.length ? fetchSupabaseRowsForIds(providerIds, batch => supabase.from('email_delivery_events').select('provider_message_id,recipient,kind,occurred_at,details').in('provider_message_id', batch).order('occurred_at', { ascending: false }).order('event_key')).then(data => ({ data, error: null })) : { data: [], error: null },
    ]);
    if (archives.error || delivery.error) throw archives.error || delivery.error;
    const pendingInvitationIds = (data ?? [])
      .filter((message) => ["queued", "failed"].includes(String(message.status)))
      .map((message) => Number(message.invitation_id));
    const { data: invitationResponses, error: invitationResponsesError } =
      pendingInvitationIds.length > 0
        ? await supabase
            .from("event_invitations")
            .select("part_responses,id,response_status,delegate_email")
            .eq("event_id", eventId)
            .in("id", pendingInvitationIds)
        : { data: [], error: null };
    if (invitationResponsesError) throw invitationResponsesError;
    const invitationsWithConfirmedParticipation = new Set(
      (invitationResponses ?? [])
        .filter(
          (invitation) =>
            !invitation.part_responses?.length && (invitation.response_status === "attending" || Boolean(invitation.delegate_email)),
        )
        .map((invitation) => Number(invitation.id)),
    );

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
        const renderedText = invitationsWithConfirmedParticipation.has(
          Number(message.invitation_id),
        )
          ? removePublicResponseLink({
              text: String(message.rendered_text),
              html: null,
              responseUrl: message.response_url,
            }).text
          : String(message.rendered_text);
        return {
          id: Number(message.id),
          to_email: String(message.to_email),
          contact_name: contactName || "Contatto senza nome",
          institution: contact?.institution ? String(contact.institution) : null,
          subject: String(message.subject),
          rendered_text: renderedText,
          status: message.status as EmailBatchPreviewMessage["status"],
          sent_at: message.sent_at,
          error_message: message.error_message,
          provider_message_id: message.provider_message_id,
          archive_status: archives.data?.find(row => row.email_log_id === message.id)?.status ?? null,
          archive_recovered: archives.data?.find(row => row.email_log_id === message.id)?.recovered ?? false,
          archive_error: archives.data?.find(row => row.email_log_id === message.id)?.last_error ?? null,
          delivery_events: (delivery.data ?? []).filter(row => row.provider_message_id === message.provider_message_id && row.recipient === message.to_email.toLowerCase()).map(row => ({ kind: row.kind, occurred_at: row.occurred_at, details: row.details })),
        };
      }),
    };
  } catch (error) {
    console.error("Could not load email batch preview", error);
    return { status: "error", message: "Impossibile caricare i dettagli delle email." };
  }
}
