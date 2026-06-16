"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth/profile";
import { sendSmtpEmail } from "@/lib/email/gmail";
import { plainTextToHtml, renderEmailTemplate, type EmailTemplateContext } from "@/lib/email/templates";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { ArchiveActionState } from "../archive-actions";

const EMAIL_SEND_LIMIT = 25;
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const TARGET_KINDS = ["selected", "selected_rows", "invited_no_response"] as const;

type TargetKind = (typeof TARGET_KINDS)[number];

type InvitationEmailRow = {
  id: number;
  event_id: number;
  contact_id: number;
  invitation_status: "selected" | "invited";
  response_status: "no_response" | "attending" | "declined" | "maybe";
  contacts: EmailTemplateContext["contact"] | EmailTemplateContext["contact"][] | null;
};

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function numberField(formData: FormData, key: string) {
  const value = Number(text(formData, key));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function numberFields(formData: FormData, key: string) {
  return [
    ...new Set(
      formData
        .getAll(key)
        .map(Number)
        .filter((value) => Number.isSafeInteger(value) && value > 0),
    ),
  ];
}

function targetKind(value: string): TargetKind | null {
  return TARGET_KINDS.includes(value as TargetKind) ? (value as TargetKind) : null;
}

function friendlyEmailError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : String(error);

  if (message.includes("Missing GMAIL_USER")) return "Configurazione SMTP Gmail mancante.";
  if (message.includes("email_attachments_file_size_valid")) return "Uno degli allegati supera 8 MB.";
  if (message.includes("row-level security")) return "Non hai i permessi necessari per questa operazione.";

  console.error("Email operation failed", error);
  return "Operazione email non riuscita. Controlla i dati e riprova.";
}

function extractRecipient(value: string | null) {
  if (!value) return null;
  const emails = value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item));
  return emails.length > 0 ? emails.join(", ") : null;
}

function contactFromRelation(value: InvitationEmailRow["contacts"]) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

async function refreshBatchCounters(batchId: number) {
  const supabase = createSupabaseServiceClient();
  const { data: rows, error } = await supabase
    .from("email_logs")
    .select("status")
    .eq("batch_id", batchId);
  if (error) throw error;

  const counts = {
    sent_count: 0,
    failed_count: 0,
    skipped_count: 0,
  };
  for (const row of rows ?? []) {
    if (row.status === "sent") counts.sent_count += 1;
    if (row.status === "failed") counts.failed_count += 1;
    if (row.status === "skipped") counts.skipped_count += 1;
  }
  const processed = counts.sent_count + counts.failed_count + counts.skipped_count;
  const total = rows?.length ?? 0;
  const nextStatus =
    total > 0 && processed >= total
      ? counts.failed_count > 0
        ? "completed_with_errors"
        : "completed"
      : "queued";

  const { error: updateError } = await supabase
    .from("email_batches")
    .update({
      ...counts,
      recipient_count: total,
      status: nextStatus,
    })
    .eq("id", batchId);
  if (updateError) throw updateError;
}

async function readAttachments(formData: FormData) {
  const files = formData
    .getAll("attachments")
    .filter((item): item is File => item instanceof File && item.size > 0);

  if (files.length > MAX_ATTACHMENTS) {
    throw new Error(`Puoi allegare al massimo ${MAX_ATTACHMENTS} file.`);
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw new Error("Gli allegati superano il limite totale di 15 MB.");
  }
  if (files.some((file) => file.size > MAX_ATTACHMENT_BYTES)) {
    throw new Error("Uno degli allegati supera 8 MB.");
  }

  return Promise.all(
    files.map(async (file) => ({
      file_name: file.name,
      content_type: file.type || "application/octet-stream",
      file_size_bytes: file.size,
      content_base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
    })),
  );
}

export async function createEmailBatchAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  const profile = await requireManager();
  const eventId = numberField(formData, "eventId");
  const templateId = numberField(formData, "templateId");
  const target = targetKind(text(formData, "targetKind")) ?? "selected";
  const selectedInvitationIds = numberFields(formData, "selectedInvitationIds");

  if (!eventId || !templateId) {
    return { status: "error", message: "Seleziona evento e template email." };
  }
  if (target === "selected_rows" && selectedInvitationIds.length === 0) {
    return { status: "error", message: "Seleziona almeno una riga della lista evento." };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const [{ data: event, error: eventError }, { data: template, error: templateError }] =
      await Promise.all([
        supabase
          .from("events")
          .select("id,title,starts_at,location")
          .eq("id", eventId)
          .maybeSingle(),
        supabase
          .from("email_templates")
          .select("id,subject,body_text,active")
          .eq("id", templateId)
          .maybeSingle(),
      ]);
    if (eventError) throw eventError;
    if (templateError) throw templateError;
    if (!event) return { status: "error", message: "Evento non trovato." };
    if (!template?.active) return { status: "error", message: "Template email non disponibile." };

    let query = supabase
      .from("event_invitations")
      .select(
        "id,event_id,contact_id,invitation_status,response_status,contacts!inner(first_name,last_name,honorific_title,honorific_title_invitation,institutional_role,institutional_role_invitation,institution,legacy_salutation,email,email_2)",
      )
      .eq("event_id", eventId);

    if (target === "selected") {
      query = query.eq("invitation_status", "selected");
    } else if (target === "selected_rows") {
      query = query.in("id", selectedInvitationIds);
    } else {
      query = query.eq("invitation_status", "invited").eq("response_status", "no_response");
    }

    const { data: invitations, error: invitationsError } = await query.order("id");
    if (invitationsError) throw invitationsError;
    const rows = ((invitations ?? []) as InvitationEmailRow[]).filter(
      (row) =>
        row.invitation_status === "selected" ||
        (row.invitation_status === "invited" && row.response_status === "no_response"),
    );
    if (rows.length === 0) {
      return { status: "error", message: "Nessun destinatario corrisponde alla selezione." };
    }

    const attachments = await readAttachments(formData);
    const { data: batch, error: batchError } = await supabase
      .from("email_batches")
      .insert({
        event_id: eventId,
        template_id: templateId,
        target_kind: target,
        status: "queued",
        created_by_profile_id: profile.id,
      })
      .select("id")
      .single();
    if (batchError) throw batchError;
    const batchId = Number(batch.id);

    if (attachments.length > 0) {
      const { data: savedAttachments, error: attachmentsError } = await supabase
        .from("email_attachments")
        .insert(
          attachments.map((attachment) => ({
            ...attachment,
            event_id: eventId,
            created_by_profile_id: profile.id,
          })),
        )
        .select("id");
      if (attachmentsError) throw attachmentsError;
      const { error: joinError } = await supabase.from("email_batch_attachments").insert(
        (savedAttachments ?? []).map((attachment) => ({
          batch_id: batchId,
          attachment_id: Number(attachment.id),
        })),
      );
      if (joinError) throw joinError;
    }

    const logRows = rows.map((row) => {
      const contact = contactFromRelation(row.contacts);
      const recipient = extractRecipient(contact?.email ?? null) ?? extractRecipient(contact?.email_2 ?? null);
      if (!contact || !recipient) {
        return {
          batch_id: batchId,
          event_id: eventId,
          invitation_id: row.id,
          contact_id: row.contact_id,
          template_id: templateId,
          to_email: "email-mancante",
          subject: template.subject,
          rendered_text: "Email mancante o non valida.",
          rendered_html: null,
          status: "skipped",
          error_message: "Email mancante o non valida.",
        };
      }
      const context = {
        event,
        contact,
      } satisfies EmailTemplateContext;
      const subject = renderEmailTemplate(template.subject, context);
      const renderedText = renderEmailTemplate(template.body_text, context);
      return {
        batch_id: batchId,
        event_id: eventId,
        invitation_id: row.id,
        contact_id: row.contact_id,
        template_id: templateId,
        to_email: recipient,
        subject,
        rendered_text: renderedText,
        rendered_html: plainTextToHtml(renderedText),
        status: "queued",
      };
    });

    const { error: logsError } = await supabase.from("email_logs").insert(logRows);
    if (logsError) throw logsError;
    await refreshBatchCounters(batchId);
    revalidatePath(`/dashboard/events/${eventId}`);
    return {
      status: "success",
      message: `Invio preparato per ${rows.length} ${rows.length === 1 ? "destinatario" : "destinatari"}.`,
    };
  } catch (error) {
    return { status: "error", message: friendlyEmailError(error) };
  }
}

export async function sendEmailBatchAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  const profile = await requireManager();
  const batchId = numberField(formData, "batchId");
  const eventId = numberField(formData, "eventId");
  const includeFailed = formData.get("includeFailed") === "on";

  if (!batchId || !eventId) {
    return { status: "error", message: "Batch email non valido." };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { data: batch, error: batchError } = await supabase
      .from("email_batches")
      .select("id,event_id,target_kind")
      .eq("id", batchId)
      .eq("event_id", eventId)
      .maybeSingle();
    if (batchError) throw batchError;
    if (!batch) return { status: "error", message: "Batch email non trovato." };

    const { data: attachmentLinks, error: attachmentError } = await supabase
      .from("email_batch_attachments")
      .select("email_attachments(file_name,content_type,content_base64)")
      .eq("batch_id", batchId);
    if (attachmentError) throw attachmentError;
    const attachments = (attachmentLinks ?? []).flatMap((link) => {
      const item = Array.isArray(link.email_attachments)
        ? link.email_attachments[0]
        : link.email_attachments;
      if (!item) return [];
      return [{
        filename: item.file_name,
        contentType: item.content_type,
        content: Buffer.from(item.content_base64, "base64"),
      }];
    });

    const statuses = includeFailed ? ["queued", "failed"] : ["queued"];
    const { data: logs, error: logsError } = await supabase
      .from("email_logs")
      .select("id,invitation_id,to_email,subject,rendered_text,rendered_html,attempt_count")
      .eq("batch_id", batchId)
      .in("status", statuses)
      .neq("to_email", "email-mancante")
      .order("id")
      .limit(EMAIL_SEND_LIMIT);
    if (logsError) throw logsError;
    if (!logs || logs.length === 0) {
      await refreshBatchCounters(batchId);
      revalidatePath(`/dashboard/events/${eventId}`);
      return { status: "success", message: "Nessuna email in coda per questo batch." };
    }

    await supabase.from("email_batches").update({ status: "sending", last_error: null }).eq("id", batchId);

    let sent = 0;
    let failed = 0;
    for (const log of logs) {
      const now = new Date().toISOString();
      await supabase
        .from("email_logs")
        .update({
          status: "sending",
          attempt_count: Number(log.attempt_count ?? 0) + 1,
          last_attempt_at: now,
          error_message: null,
        })
        .eq("id", log.id);

      try {
        const info = await sendSmtpEmail({
          to: log.to_email,
          subject: log.subject,
          text: log.rendered_text,
          html: log.rendered_html,
          attachments,
        });
        const sentAt = new Date().toISOString();
        const [{ error: logUpdateError }, { error: invitationUpdateError }] = await Promise.all([
          supabase
            .from("email_logs")
            .update({
              status: "sent",
              sent_at: sentAt,
              provider_message_id: info.messageId,
            })
            .eq("id", log.id),
          supabase
            .from("event_invitations")
            .update({
              invitation_status: "invited",
              invited_at: sentAt,
              response_status: "no_response",
              attendance_status: "unknown",
              invitation_status_updated_at: sentAt,
              invitation_status_updated_by_profile_id: profile.id,
              updated_by_profile_id: profile.id,
            })
            .eq("id", log.invitation_id)
            .eq("event_id", eventId)
            .eq("invitation_status", "selected"),
        ]);
        if (logUpdateError) throw logUpdateError;
        if (invitationUpdateError) throw invitationUpdateError;
        sent += 1;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await supabase
          .from("email_logs")
          .update({
            status: "failed",
            error_message: errorMessage.slice(0, 1000),
          })
          .eq("id", log.id);
        failed += 1;
      }
    }

    await refreshBatchCounters(batchId);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/events");
    revalidatePath(`/dashboard/events/${eventId}`);
    return {
      status: failed > 0 ? "error" : "success",
      message: `${sent} email inviate${failed > 0 ? `, ${failed} fallite` : ""}.`,
    };
  } catch (error) {
    return { status: "error", message: friendlyEmailError(error) };
  }
}
