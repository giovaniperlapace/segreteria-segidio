"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth/profile";
import { sendSmtpEmail } from "@/lib/email/gmail";
import {
  appendPublicResponseLink,
  createPublicResponseToken,
  hashPublicResponseToken,
  publicResponseUrl,
  removePublicResponseLink,
} from "@/lib/email/public-response-links";
import { plainTextToHtml, renderEmailTemplate, type EmailTemplateContext } from "@/lib/email/templates";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { ArchiveActionState } from "../archive-actions";

const EMAIL_SEND_LIMIT = 25;
const EMAIL_RECIPIENT_QUERY_PAGE_SIZE = 1000;
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const TARGET_KINDS = [
  "selected",
  "selected_rows",
  "invited_no_response",
  "participants",
  "all_invited",
] as const;

type TargetKind = (typeof TARGET_KINDS)[number];

type InvitationEmailRow = {
  id: number;
  event_id: number;
  contact_id: number;
  invitation_status: "selected" | "invited";
  response_status: "no_response" | "attending" | "declined" | "maybe";
  delegate_email: string | null;
  contacts: EmailTemplateContext["contact"] | EmailTemplateContext["contact"][] | null;
};

type EmailLogToSend = {
  id: number;
  invitation_id: number;
  contact_id: number;
  to_email: string;
  subject: string;
  rendered_text: string;
  rendered_html: string | null;
  attempt_count: number | null;
  response_token_id: number | null;
  response_url: string | null;
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

function extractRecipients(...values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const emails = values
    .flatMap((value) => value?.split(/[;,]/) ?? [])
    .map((item) => item.trim())
    .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))
    .filter((item) => {
      const normalized = item.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  return emails.length > 0 ? emails.join(", ") : null;
}

function contactFromRelation(value: InvitationEmailRow["contacts"]) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function invitationMatchesTarget(row: InvitationEmailRow, target: TargetKind) {
  if (target === "selected") return row.invitation_status === "selected";
  if (target === "selected_rows") {
    return (
      row.invitation_status === "selected" ||
      (row.invitation_status === "invited" && row.response_status === "no_response")
    );
  }
  if (target === "invited_no_response") {
    return row.invitation_status === "invited" && row.response_status === "no_response";
  }
  if (target === "participants") {
    return (
      row.invitation_status === "invited" &&
      (row.response_status === "attending" || Boolean(row.delegate_email))
    );
  }
  return row.invitation_status === "invited";
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

  return {
    ...counts,
    recipientCount: total,
    remainingCount: Math.max(0, total - processed),
    status: nextStatus,
  };
}

async function ensurePublicResponseLink(input: {
  supabase: ReturnType<typeof createSupabaseServiceClient>;
  log: EmailLogToSend;
  eventId: number;
  profileId: string;
}) {
  if (input.log.response_url) {
    const rendered = appendPublicResponseLink({
      text: input.log.rendered_text,
      html: input.log.rendered_html,
      responseUrl: input.log.response_url,
    });
    if (
      rendered.text !== input.log.rendered_text ||
      rendered.html !== input.log.rendered_html
    ) {
      const { error: logError } = await input.supabase
        .from("email_logs")
        .update({
          rendered_text: rendered.text,
          rendered_html: rendered.html,
        })
        .eq("id", input.log.id);
      if (logError) throw logError;
    }
    return rendered;
  }

  const rawToken = createPublicResponseToken();
  const responseUrl = publicResponseUrl(rawToken);
  const { data: tokenRow, error: tokenError } = await input.supabase
    .from("invitation_response_tokens")
    .insert({
      invitation_id: input.log.invitation_id,
      event_id: input.eventId,
      contact_id: input.log.contact_id,
      token_hash: hashPublicResponseToken(rawToken),
      token_prefix: rawToken.slice(0, 8),
      created_by_profile_id: input.profileId,
    })
    .select("id")
    .single();
  if (tokenError) throw tokenError;

  const rendered = appendPublicResponseLink({
    text: input.log.rendered_text,
    html: input.log.rendered_html,
    responseUrl,
  });

  const { error: logError } = await input.supabase
    .from("email_logs")
    .update({
      rendered_text: rendered.text,
      rendered_html: rendered.html,
      response_token_id: Number(tokenRow.id),
      response_url: responseUrl,
    })
    .eq("id", input.log.id);
  if (logError) throw logError;

  return rendered;
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
          .is("deleted_at", null)
          .maybeSingle(),
      ]);
    if (eventError) throw eventError;
    if (templateError) throw templateError;
    if (!event) return { status: "error", message: "Evento non trovato." };
    if (!template?.active) return { status: "error", message: "Template email non disponibile." };

    const invitationRows: InvitationEmailRow[] = [];
    for (let from = 0; ; from += EMAIL_RECIPIENT_QUERY_PAGE_SIZE) {
      let query = supabase
        .from("event_invitations")
        .select(
          "id,event_id,contact_id,invitation_status,response_status,delegate_email,contacts!inner(first_name,last_name,honorific_title,honorific_title_invitation,institutional_role,institutional_role_invitation,institution,legacy_salutation,email,email_2)",
        )
        .eq("event_id", eventId);

      if (target === "selected") {
        query = query.eq("invitation_status", "selected");
      } else if (target === "selected_rows") {
        query = query.in("id", selectedInvitationIds);
      } else if (target === "invited_no_response") {
        query = query.eq("invitation_status", "invited").eq("response_status", "no_response");
      } else if (target === "participants") {
        query = query
          .eq("invitation_status", "invited")
          .or("response_status.eq.attending,delegate_email.not.is.null");
      } else {
        query = query.eq("invitation_status", "invited");
      }

      const { data: invitations, error: invitationsError } = await query
        .order("id")
        .range(from, from + EMAIL_RECIPIENT_QUERY_PAGE_SIZE - 1);
      if (invitationsError) throw invitationsError;
      const page = (invitations ?? []) as InvitationEmailRow[];
      invitationRows.push(...page);
      if (page.length < EMAIL_RECIPIENT_QUERY_PAGE_SIZE) break;
    }

    const rows = invitationRows.filter((row) =>
      invitationMatchesTarget(row, target),
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
      const recipient = extractRecipients(contact?.email, contact?.email_2);
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

export async function deleteEmailBatchAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  await requireManager();
  const batchId = numberField(formData, "batchId");
  const eventId = numberField(formData, "eventId");

  if (!batchId || !eventId) {
    return { status: "error", message: "Blocco email non valido." };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const [{ data: batch, error: batchError }, { data: logs, error: logsError }] =
      await Promise.all([
        supabase
          .from("email_batches")
          .select("id,event_id,status,sent_count,failed_count")
          .eq("id", batchId)
          .eq("event_id", eventId)
          .maybeSingle(),
        supabase
          .from("email_logs")
          .select("status,attempt_count")
          .eq("batch_id", batchId),
      ]);
    if (batchError) throw batchError;
    if (logsError) throw logsError;
    if (!batch) return { status: "error", message: "Blocco email non trovato." };

    const hasStarted =
      batch.status === "sending" ||
      Number(batch.sent_count) > 0 ||
      Number(batch.failed_count) > 0 ||
      (logs ?? []).some(
        (log) =>
          Number(log.attempt_count ?? 0) > 0 ||
          ["sending", "sent", "failed"].includes(String(log.status)),
      );
    if (hasStarted) {
      return {
        status: "error",
        message: "Non puoi eliminare un blocco per cui e' gia' iniziato un tentativo di invio.",
      };
    }

    const { data: attachmentLinks, error: attachmentLinksError } = await supabase
      .from("email_batch_attachments")
      .select("attachment_id")
      .eq("batch_id", batchId);
    if (attachmentLinksError) throw attachmentLinksError;

    const { data: deletedBatch, error: deleteError } = await supabase
      .from("email_batches")
      .delete()
      .eq("id", batchId)
      .eq("event_id", eventId)
      .neq("status", "sending")
      .eq("sent_count", 0)
      .eq("failed_count", 0)
      .select("id")
      .maybeSingle();
    if (deleteError) throw deleteError;
    if (!deletedBatch) {
      return {
        status: "error",
        message: "Il blocco non e' stato eliminato: nel frattempo potrebbe essere iniziato l'invio.",
      };
    }

    const attachmentIds = (attachmentLinks ?? []).map((link) => Number(link.attachment_id));
    if (attachmentIds.length > 0) {
      const { data: remainingLinks, error: remainingLinksError } = await supabase
        .from("email_batch_attachments")
        .select("attachment_id")
        .in("attachment_id", attachmentIds);
      if (remainingLinksError) {
        console.error("Could not check orphan email attachments", remainingLinksError);
      } else {
        const stillUsed = new Set((remainingLinks ?? []).map((link) => Number(link.attachment_id)));
        const orphanIds = attachmentIds.filter((id) => !stillUsed.has(id));
        if (orphanIds.length > 0) {
          const { error: attachmentDeleteError } = await supabase
            .from("email_attachments")
            .delete()
            .in("id", orphanIds);
          if (attachmentDeleteError) {
            console.error("Could not delete orphan email attachments", attachmentDeleteError);
          }
        }
      }
    }

    revalidatePath(`/dashboard/events/${eventId}`);
    return { status: "success", message: "Blocco email eliminato." };
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
      .select("id,event_id,target_kind,status,sent_count,failed_count,include_public_response_link")
      .eq("id", batchId)
      .eq("event_id", eventId)
      .maybeSingle();
    if (batchError) throw batchError;
    if (!batch) return { status: "error", message: "Batch email non trovato." };

    const requestedIncludePublicResponseLink = formData.get("omitPublicResponseLink") !== "on";
    const includePublicResponseLink = Boolean(batch.include_public_response_link);
    if (requestedIncludePublicResponseLink !== includePublicResponseLink) {
      const hasStarted =
        batch.status === "sending" ||
        Number(batch.sent_count) > 0 ||
        Number(batch.failed_count) > 0;
      if (hasStarted) {
        return {
          status: "error",
          message: "L'impostazione del pulsante di risposta non puo' cambiare dopo l'inizio dell'invio.",
        };
      }

      const { data: updatedPreference, error: preferenceError } = await supabase
        .from("email_batches")
        .update({ include_public_response_link: requestedIncludePublicResponseLink })
        .eq("id", batchId)
        .eq("event_id", eventId)
        .neq("status", "sending")
        .eq("sent_count", 0)
        .eq("failed_count", 0)
        .select("id")
        .maybeSingle();
      if (preferenceError) throw preferenceError;
      if (!updatedPreference) {
        return {
          status: "error",
          message: "Il batch e' cambiato mentre preparavi l'invio. Aggiorna la pagina e riprova.",
        };
      }
    }

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
      .select("id,invitation_id,contact_id,to_email,subject,rendered_text,rendered_html,attempt_count,response_token_id,response_url")
      .eq("batch_id", batchId)
      .in("status", statuses)
      .neq("to_email", "email-mancante")
      .order("id")
      .limit(EMAIL_SEND_LIMIT);
    if (logsError) throw logsError;
    if (!logs || logs.length === 0) {
      const counters = await refreshBatchCounters(batchId);
      revalidatePath(`/dashboard/events/${eventId}`);
      return {
        status: "success",
        message: "Nessuna email in coda per questo batch.",
        batchId,
        remainingCount: counters.remainingCount,
      };
    }

    const invitationIds = logs.map((log) => Number(log.invitation_id));
    const { data: invitationResponses, error: invitationResponsesError } = await supabase
      .from("event_invitations")
      .select("id,response_status,delegate_email")
      .eq("event_id", eventId)
      .in("id", invitationIds);
    if (invitationResponsesError) throw invitationResponsesError;
    const invitationsWithConfirmedParticipation = new Set(
      (invitationResponses ?? [])
        .filter(
          (invitation) =>
            invitation.response_status === "attending" || Boolean(invitation.delegate_email),
        )
        .map((invitation) => Number(invitation.id)),
    );

    const { data: sendingBatch, error: sendingBatchError } = await supabase
      .from("email_batches")
      .update({ status: "sending", last_error: null })
      .eq("id", batchId)
      .select("id")
      .maybeSingle();
    if (sendingBatchError) throw sendingBatchError;
    if (!sendingBatch) {
      return { status: "error", message: "Il blocco email non e' piu' disponibile." };
    }

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
        const shouldIncludePublicResponseLink =
          requestedIncludePublicResponseLink &&
          !invitationsWithConfirmedParticipation.has(Number(log.invitation_id));
        const rendered = shouldIncludePublicResponseLink
          ? await ensurePublicResponseLink({
              supabase,
              log: log as EmailLogToSend,
              eventId,
              profileId: profile.id,
            })
          : removePublicResponseLink({
              text: log.rendered_text,
              html: log.rendered_html,
              responseUrl: log.response_url,
            });
        if (
          !shouldIncludePublicResponseLink &&
          (rendered.text !== log.rendered_text || rendered.html !== log.rendered_html)
        ) {
          const { error: renderedUpdateError } = await supabase
            .from("email_logs")
            .update({
              rendered_text: rendered.text,
              rendered_html: rendered.html,
            })
            .eq("id", log.id);
          if (renderedUpdateError) throw renderedUpdateError;
        }
        const info = await sendSmtpEmail({
          to: log.to_email,
          subject: log.subject,
          text: rendered.text,
          html: rendered.html,
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

    const counters = await refreshBatchCounters(batchId);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/events");
    revalidatePath(`/dashboard/events/${eventId}`);
    return {
      status: failed > 0 ? "error" : "success",
      message:
        failed > 0
          ? `${sent} email inviate, ${failed} fallite. L'invio automatico si e' fermato per consentire il controllo degli errori.`
          : counters.remainingCount > 0
            ? `${sent} email inviate. Proseguo automaticamente con le ${counters.remainingCount} rimaste.`
            : `${sent} email inviate. Invio completato.`,
      batchId,
      remainingCount: counters.remainingCount,
    };
  } catch (error) {
    return { status: "error", message: friendlyEmailError(error) };
  }
}
