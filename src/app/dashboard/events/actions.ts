"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth/profile";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { ArchiveActionState } from "../archive-actions";

const EVENT_STATUSES = ["draft", "active", "concluded", "archived"] as const;
const INVITATION_STATUSES = ["draft", "proposed", "selected", "invited", "excluded"] as const;
const RESPONSE_STATUSES = ["no_response", "attending", "declined", "maybe"] as const;
const ATTENDANCE_STATUSES = ["unknown", "attended", "absent"] as const;

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optionalText(formData: FormData, key: string) {
  return text(formData, key) || null;
}

function numberField(formData: FormData, key: string) {
  const value = Number(text(formData, key));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function nonNegativeNumberField(formData: FormData, key: string) {
  const value = Number(text(formData, key));
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
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

function localDateTimeToIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function eventStatus(value: string) {
  return EVENT_STATUSES.includes(value as (typeof EVENT_STATUSES)[number]) ? value : null;
}

function responseStatus(value: string) {
  return RESPONSE_STATUSES.includes(value as (typeof RESPONSE_STATUSES)[number]) ? value : null;
}

function invitationStatus(value: string) {
  return INVITATION_STATUSES.includes(value as (typeof INVITATION_STATUSES)[number]) ? value : null;
}

function attendanceStatus(value: string) {
  return ATTENDANCE_STATUSES.includes(value as (typeof ATTENDANCE_STATUSES)[number]) ? value : null;
}

function friendlyError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : String(error);

  if (message.includes("events_title_not_blank")) return "Inserisci un titolo evento.";
  if (message.includes("events_ends_after_starts")) return "La fine deve essere successiva all'inizio.";
  if (message.includes("events_legacy_access_id_unique_idx")) return "Esiste gia' un evento con questo id Access.";
  if (message.includes("event_invitations_event_contact_unique")) return "Questo contatto e' gia' nella lista evento.";
  if (message.includes("row-level security")) return "Non hai i permessi necessari per questa operazione.";

  console.error("Event operation failed", error);
  return "Operazione non riuscita. Controlla i dati e riprova.";
}

export async function createEventAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  const profile = await requireManager();
  const title = text(formData, "title");
  const startsAt = localDateTimeToIso(text(formData, "startsAt"));
  const endsAt = localDateTimeToIso(text(formData, "endsAt"));
  const status = eventStatus(text(formData, "status")) ?? "draft";

  if (!title || !startsAt) {
    return { status: "error", message: "Titolo e data inizio sono obbligatori." };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { error } = await supabase.from("events").insert({
      title,
      description: optionalText(formData, "description"),
      starts_at: startsAt,
      ends_at: endsAt,
      location: optionalText(formData, "location"),
      organizational_notes: optionalText(formData, "organizationalNotes"),
      status,
      created_by_profile_id: profile.id,
      updated_by_profile_id: profile.id,
    });
    if (error) throw error;
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/events");
    return { status: "success", message: "Evento creato." };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
}

export async function updateEventAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  const profile = await requireManager();
  const eventId = numberField(formData, "eventId");
  const title = text(formData, "title");
  const startsAt = localDateTimeToIso(text(formData, "startsAt"));
  const endsAt = localDateTimeToIso(text(formData, "endsAt"));
  const status = eventStatus(text(formData, "status"));

  if (!eventId || !title || !startsAt || !status) {
    return { status: "error", message: "Controlla titolo, stato e data inizio." };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { error } = await supabase
      .from("events")
      .update({
        title,
        description: optionalText(formData, "description"),
        starts_at: startsAt,
        ends_at: endsAt,
        location: optionalText(formData, "location"),
        organizational_notes: optionalText(formData, "organizationalNotes"),
        status,
        updated_by_profile_id: profile.id,
      })
      .eq("id", eventId);
    if (error) throw error;
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/events");
    revalidatePath(`/dashboard/events/${eventId}`);
    return { status: "success", message: "Evento aggiornato." };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
}

export async function addInvitationAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  const profile = await requireManager();
  const eventId = numberField(formData, "eventId");
  const contactId = numberField(formData, "contactId");

  if (!eventId || !contactId) {
    return { status: "error", message: "Seleziona un contatto valido." };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { error } = await supabase.from("event_invitations").insert({
      event_id: eventId,
      contact_id: contactId,
      invitation_status: "selected",
      response_status: "no_response",
      attendance_status: "unknown",
      selected_by_profile_id: profile.id,
      invitation_status_updated_at: new Date().toISOString(),
      invitation_status_updated_by_profile_id: profile.id,
      updated_by_profile_id: profile.id,
    });
    if (error) throw error;
    revalidatePath("/dashboard/events");
    revalidatePath(`/dashboard/events/${eventId}`);
    return { status: "success", message: "Invitato aggiunto all'evento." };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
}

export async function bulkAddInvitationsAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  const profile = await requireManager();
  const eventId = numberField(formData, "eventId");
  const contactIds = numberFields(formData, "contactIds");

  if (!eventId || contactIds.length === 0) {
    return { status: "error", message: "Seleziona almeno un contatto." };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { error } = await supabase.from("event_invitations").upsert(
      contactIds.map((contactId) => ({
        event_id: eventId,
        contact_id: contactId,
        invitation_status: "selected",
        response_status: "no_response",
        attendance_status: "unknown",
        selected_by_profile_id: profile.id,
        invitation_status_updated_at: new Date().toISOString(),
        invitation_status_updated_by_profile_id: profile.id,
        updated_by_profile_id: profile.id,
      })),
      { onConflict: "event_id,contact_id", ignoreDuplicates: true },
    );
    if (error) throw error;
    revalidatePath("/dashboard/events");
    revalidatePath(`/dashboard/events/${eventId}`);
    revalidatePath(`/dashboard/events/${eventId}/build`);
    return {
      status: "success",
      message: `${contactIds.length} contatti elaborati. Gli eventuali duplicati sono stati ignorati.`,
    };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
}

export async function bulkCreateProposalsAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  const profile = await requireManager();
  const eventId = numberField(formData, "eventId");
  const contactIds = numberFields(formData, "contactIds");
  const referenceIds = numberFields(formData, "proposalReferenceIds");

  if (!eventId || contactIds.length === 0 || referenceIds.length === 0) {
    return {
      status: "error",
      message: "Seleziona almeno un contatto e almeno un referente approvatore.",
    };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { data: assignments, error: assignmentsError } = await supabase
      .from("contact_references")
      .select("contact_id,reference_id")
      .in("contact_id", contactIds)
      .in("reference_id", referenceIds);
    if (assignmentsError) throw assignmentsError;
    const rows = (assignments ?? []).map((assignment) => ({
      event_id: eventId,
      contact_id: Number(assignment.contact_id),
      reference_id: Number(assignment.reference_id),
      status: "pending",
      manager_note: optionalText(formData, "managerNote"),
      created_by_profile_id: profile.id,
    }));
    if (rows.length === 0) {
      return {
        status: "error",
        message: "Nessun contatto selezionato e' associato ai referenti approvatori scelti.",
      };
    }
    const { error } = await supabase
      .from("invitation_proposals")
      .upsert(rows, {
        onConflict: "event_id,contact_id,reference_id",
        ignoreDuplicates: true,
      });
    if (error) throw error;
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/events/${eventId}`);
    revalidatePath(`/dashboard/events/${eventId}/build`);
    revalidatePath("/dashboard/proposals");
    return {
      status: "success",
      message: `${rows.length} proposte elaborate. Le proposte gia' presenti sono state ignorate.`,
    };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
}

export async function addApprovedProposalsAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  const profile = await requireManager();
  const eventId = numberField(formData, "eventId");

  if (!eventId) {
    return { status: "error", message: "Evento non valido." };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { data: approved, error: approvedError } = await supabase
      .from("invitation_proposals")
      .select("contact_id")
      .eq("event_id", eventId)
      .eq("status", "approved");
    if (approvedError) throw approvedError;

    const contactIds = [...new Set((approved ?? []).map((row) => Number(row.contact_id)))];
    if (contactIds.length === 0) {
      return { status: "error", message: "Non ci sono proposte approvate da trasformare in inviti." };
    }

    const { error } = await supabase.from("event_invitations").upsert(
      contactIds.map((contactId) => ({
        event_id: eventId,
        contact_id: contactId,
        invitation_status: "selected",
        response_status: "no_response",
        attendance_status: "unknown",
        selected_by_profile_id: profile.id,
        invitation_status_updated_at: new Date().toISOString(),
        invitation_status_updated_by_profile_id: profile.id,
        updated_by_profile_id: profile.id,
      })),
      { onConflict: "event_id,contact_id", ignoreDuplicates: true },
    );
    if (error) throw error;
    revalidatePath("/dashboard/events");
    revalidatePath(`/dashboard/events/${eventId}`);
    revalidatePath(`/dashboard/events/${eventId}/build`);
    return {
      status: "success",
      message: `${contactIds.length} proposte approvate elaborate come inviti.`,
    };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
}

export async function updateInvitationAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  const profile = await requireManager();
  const invitationId = numberField(formData, "invitationId");
  const eventId = numberField(formData, "eventId");
  const status = invitationStatus(text(formData, "invitationStatus"));
  const requestedResponse = responseStatus(text(formData, "responseStatus")) ?? "no_response";
  const attendance = attendanceStatus(text(formData, "attendanceStatus"));
  const requestedCompanionCount = Math.min(nonNegativeNumberField(formData, "companionCount") ?? 0, 20);
  const requestedCompanionNames = optionalText(formData, "companionNames");

  if (!invitationId || !eventId || !status || !attendance) {
    return { status: "error", message: "Invito non valido." };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { data: currentInvitation, error: currentError } = await supabase
      .from("event_invitations")
      .select("contact_id,invitation_status,response_status,response_source,companion_count,companion_names,invited_at,response_recorded_at,response_recorded_by_profile_id")
      .eq("id", invitationId)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!currentInvitation) {
      return { status: "error", message: "Invito non trovato." };
    }
    const attentionNote = optionalText(formData, "attentionNote");
    const responseChanged = requestedResponse !== currentInvitation.response_status;
    const statusChanged = status !== currentInvitation.invitation_status;
    const isInvited = status === "invited";
    const response = isInvited ? requestedResponse : "no_response";
    const companionCount = isInvited && response === "attending" ? requestedCompanionCount : 0;
    const companionNames = companionCount > 0 ? requestedCompanionNames : null;
    const responseDetailsChanged =
      responseChanged ||
      companionCount !== Number(currentInvitation.companion_count ?? 0) ||
      companionNames !== (currentInvitation.companion_names ?? null);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("event_invitations")
      .update({
        invitation_status: status,
        response_status: response,
        attendance_status: isInvited ? attendance : "unknown",
        attention_flag: formData.get("attentionFlag") === "on",
        attention_note: attentionNote,
        notes: optionalText(formData, "notes"),
        response_note: isInvited ? optionalText(formData, "responseNote") : null,
        companion_count: companionCount,
        companion_names: companionNames,
        response_recorded_at:
          response === "no_response"
            ? null
            : responseDetailsChanged
              ? now
              : currentInvitation.response_recorded_at,
        response_recorded_by_profile_id:
          response === "no_response"
            ? null
            : responseDetailsChanged
              ? profile.id
              : currentInvitation.response_recorded_by_profile_id,
        response_source:
          response === "no_response"
            ? null
            : responseDetailsChanged
              ? "admin"
              : currentInvitation.response_source,
        invited_at: isInvited ? currentInvitation.invited_at ?? now : null,
        selected_by_profile_id: statusChanged ? profile.id : undefined,
        invitation_status_updated_at: statusChanged ? now : undefined,
        invitation_status_updated_by_profile_id: statusChanged ? profile.id : undefined,
        updated_by_profile_id: profile.id,
      })
      .eq("id", invitationId);
    if (error) throw error;

    if (isInvited && responseDetailsChanged) {
      const { error: historyError } = await supabase.from("invitation_responses").insert({
        invitation_id: invitationId,
        event_id: eventId,
        contact_id: Number(currentInvitation.contact_id),
        response_status: response,
        source: "admin",
        actor_profile_id: profile.id,
        previous_response_status: currentInvitation.response_status,
        response_note: response === "no_response" ? null : optionalText(formData, "responseNote"),
        companion_count: companionCount,
        companion_names: companionNames,
      });
      if (historyError) throw historyError;
    }
    revalidatePath("/dashboard/events");
    revalidatePath(`/dashboard/events/${eventId}`);
    return { status: "success", message: "Invito aggiornato." };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
}

export async function bulkUpdateInvitationStatusAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  const profile = await requireManager();
  const eventId = numberField(formData, "eventId");
  const invitationIds = numberFields(formData, "invitationIds");
  const proposalContactIds = numberFields(formData, "proposalContactIds");
  const status = invitationStatus(text(formData, "invitationStatus"));

  if (!eventId || (invitationIds.length === 0 && proposalContactIds.length === 0) || !status) {
    return { status: "error", message: "Seleziona almeno un contatto e uno stato valido." };
  }

  try {
    const supabase = createSupabaseServiceClient();
    let invitationRows: Array<{
      id: number;
      invitation_status: (typeof INVITATION_STATUSES)[number];
      invited_at: string | null;
    }> = [];
    if (invitationIds.length > 0) {
      const { data: rows, error: rowsError } = await supabase
        .from("event_invitations")
        .select("id,invitation_status,invited_at")
        .eq("event_id", eventId)
        .in("id", invitationIds);
      if (rowsError) throw rowsError;
      if ((rows ?? []).length !== invitationIds.length) {
        return { status: "error", message: "Una o più righe non appartengono a questo evento." };
      }
      invitationRows = (rows ?? []) as typeof invitationRows;
    }

    let proposalRows: Array<{ id: number; contact_id: number }> = [];
    if (proposalContactIds.length > 0) {
      const { data, error } = await supabase
        .from("invitation_proposals")
        .select("id, contact_id")
        .eq("event_id", eventId)
        .eq("status", "pending")
        .in("contact_id", proposalContactIds);
      if (error) throw error;
      proposalRows = (data ?? []).map((row) => ({
        id: Number(row.id),
        contact_id: Number(row.contact_id),
      }));
      const foundContactIds = new Set(proposalRows.map((row) => row.contact_id));
      if (proposalContactIds.some((contactId) => !foundContactIds.has(contactId))) {
        return { status: "error", message: "Una o più proposte non sono più in attesa." };
      }
    }

    if (invitationRows.length > 0) {
      const now = new Date().toISOString();
      const updates = invitationRows.map((row) => {
        const isInvited = status === "invited";
        const statusChanged = row.invitation_status !== status;
        return supabase
          .from("event_invitations")
          .update({
            invitation_status: status,
            selected_by_profile_id: statusChanged ? profile.id : undefined,
            invitation_status_updated_at: statusChanged ? now : undefined,
            invitation_status_updated_by_profile_id: statusChanged ? profile.id : undefined,
            updated_by_profile_id: profile.id,
            invited_at: isInvited ? row.invited_at ?? now : null,
            response_status: isInvited ? undefined : "no_response",
            response_source: isInvited ? undefined : null,
            response_note: isInvited ? undefined : null,
            companion_count: isInvited ? undefined : 0,
            companion_names: isInvited ? undefined : null,
            response_recorded_at: isInvited ? undefined : null,
            response_recorded_by_profile_id: isInvited ? undefined : null,
            attendance_status: isInvited ? undefined : "unknown",
          })
          .eq("event_id", eventId)
          .eq("id", row.id);
      });
      const results = await Promise.all(updates);
      const updateError = results.find((result) => result.error)?.error;
      if (updateError) throw updateError;
    }

    const convertedContactIds = [...new Set(proposalRows.map((row) => row.contact_id))];
    if (convertedContactIds.length > 0) {
      if (status !== "excluded") {
        const now = new Date().toISOString();
        const { error: insertError } = await supabase.from("event_invitations").insert(
          convertedContactIds.map((contactId) => ({
            event_id: eventId,
            contact_id: contactId,
            invitation_status: status,
            response_status: "no_response",
            attendance_status: "unknown",
            selected_by_profile_id: profile.id,
            invitation_status_updated_at: now,
            invitation_status_updated_by_profile_id: profile.id,
            updated_by_profile_id: profile.id,
            invited_at: status === "invited" ? now : null,
          })),
        );
        if (insertError) throw insertError;
      }

      const { error: proposalError } = await supabase
        .from("invitation_proposals")
        .update({
          status: status === "excluded" ? "excluded" : "approved",
          decided_by_profile_id: profile.id,
          decided_at: new Date().toISOString(),
        })
        .in("id", proposalRows.map((row) => row.id));
      if (proposalError) {
        if (status !== "excluded") {
          await supabase
            .from("event_invitations")
            .delete()
            .eq("event_id", eventId)
            .in("contact_id", convertedContactIds);
        }
        throw proposalError;
      }
    }

    revalidatePath("/dashboard/events");
    revalidatePath(`/dashboard/events/${eventId}`);
    const affectedCount = invitationIds.length + proposalContactIds.length;
    return {
      status: "success",
      message: `Stato aggiornato per ${affectedCount} ${affectedCount === 1 ? "contatto" : "contatti"}.`,
    };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
}

export async function bulkUpdateInvitationResponseAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  const profile = await requireManager();
  const eventId = numberField(formData, "eventId");
  const invitationIds = numberFields(formData, "invitationIds");
  const response = responseStatus(text(formData, "responseStatus"));

  if (!eventId || invitationIds.length === 0 || !response) {
    return { status: "error", message: "Seleziona almeno un invitato e una risposta valida." };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { data: rows, error: rowsError } = await supabase
      .from("event_invitations")
      .select("id,invitation_status,contact_id,response_status")
      .eq("event_id", eventId)
      .in("id", invitationIds);
    if (rowsError) throw rowsError;
    if ((rows ?? []).length !== invitationIds.length) {
      return { status: "error", message: "Una o più righe non appartengono a questo evento." };
    }
    if ((rows ?? []).some((row) => row.invitation_status !== "invited")) {
      return {
        status: "error",
        message: "Le risposte possono essere registrate solo per contatti con stato Invitato.",
      };
    }

    const { error } = await supabase
      .from("event_invitations")
      .update({
        response_status: response,
        response_source: response === "no_response" ? null : "admin",
        response_note: optionalText(formData, "responseNote"),
        companion_count: 0,
        companion_names: null,
        response_recorded_at: response === "no_response" ? null : new Date().toISOString(),
        response_recorded_by_profile_id: response === "no_response" ? null : profile.id,
        updated_by_profile_id: profile.id,
      })
      .eq("event_id", eventId)
      .in("id", invitationIds);
    if (error) throw error;

    const historyRows = (rows ?? []).map((row) => ({
      invitation_id: Number(row.id),
      event_id: eventId,
      contact_id: Number(row.contact_id),
      response_status: response,
      source: "admin",
      actor_profile_id: profile.id,
      previous_response_status: row.response_status,
      response_note: response === "no_response" ? null : optionalText(formData, "responseNote"),
      companion_count: 0,
      companion_names: null,
    }));
    const { error: historyError } = await supabase
      .from("invitation_responses")
      .insert(historyRows);
    if (historyError) throw historyError;

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/events");
    revalidatePath(`/dashboard/events/${eventId}`);
    return {
      status: "success",
      message: `Risposta aggiornata per ${invitationIds.length} ${
        invitationIds.length === 1 ? "invitato" : "invitati"
      }.`,
    };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
}

export async function undoBulkInvitationStatusAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  const profile = await requireManager();
  const eventId = numberField(formData, "eventId");
  let previousStates: Array<{
    id: number;
    contactId: number;
    rowType: "invitation" | "proposal";
    status: (typeof INVITATION_STATUSES)[number] | "pending_approval";
    proposalIds: number[];
    responseStatus: (typeof RESPONSE_STATUSES)[number];
    responseSource: "admin" | "public_link" | null;
    attendanceStatus: (typeof ATTENDANCE_STATUSES)[number];
    responseNote: string | null;
    companionCount: number;
    companionNames: string | null;
    invitedAt: string | null;
    responseRecordedAt: string | null;
    responseRecordedByProfileId: string | null;
  }> = [];

  try {
    const parsed = JSON.parse(text(formData, "previousStates"));
    if (Array.isArray(parsed)) {
      previousStates = parsed
        .map((item) => ({
          id: Number(item?.id),
          contactId: Number(item?.contactId),
          rowType: item?.rowType === "proposal" ? "proposal" as const : "invitation" as const,
          status:
            item?.rowType === "proposal" && item?.status === "pending_approval"
              ? "pending_approval" as const
              : invitationStatus(String(item?.status ?? "")),
          proposalIds: Array.isArray(item?.proposalIds)
            ? item.proposalIds
              .map(Number)
              .filter((id: number) => Number.isSafeInteger(id) && id > 0)
            : [],
          responseStatus: responseStatus(String(item?.responseStatus ?? "")) ?? "no_response",
          responseSource:
            item?.responseSource === "admin" || item?.responseSource === "public_link"
              ? item.responseSource
              : null,
          attendanceStatus: attendanceStatus(String(item?.attendanceStatus ?? "")) ?? "unknown",
          responseNote:
            typeof item?.responseNote === "string" && item.responseNote.trim()
              ? item.responseNote.trim()
              : null,
          companionCount:
            Number.isSafeInteger(Number(item?.companionCount)) && Number(item?.companionCount) > 0
              ? Math.min(Number(item.companionCount), 20)
              : 0,
          companionNames:
            typeof item?.companionNames === "string" && item.companionNames.trim()
              ? item.companionNames.trim()
              : null,
          invitedAt: typeof item?.invitedAt === "string" ? item.invitedAt : null,
          responseRecordedAt:
            typeof item?.responseRecordedAt === "string" ? item.responseRecordedAt : null,
          responseRecordedByProfileId:
            typeof item?.responseRecordedByProfileId === "string"
              ? item.responseRecordedByProfileId
              : null,
        }))
        .filter(
          (
            item,
          ): item is {
            id: number;
            contactId: number;
            rowType: "invitation" | "proposal";
            status: (typeof INVITATION_STATUSES)[number] | "pending_approval";
            proposalIds: number[];
            responseStatus: (typeof RESPONSE_STATUSES)[number];
            responseSource: "admin" | "public_link" | null;
            attendanceStatus: (typeof ATTENDANCE_STATUSES)[number];
            responseNote: string | null;
            companionCount: number;
            companionNames: string | null;
            invitedAt: string | null;
            responseRecordedAt: string | null;
            responseRecordedByProfileId: string | null;
          } =>
            Number.isSafeInteger(item.id) &&
            Number.isSafeInteger(item.contactId) &&
            item.contactId > 0 &&
            Boolean(item.status) &&
            (item.rowType === "proposal"
              ? item.proposalIds.length > 0
              : item.id > 0),
        );
    }
  } catch {
    return { status: "error", message: "Dati undo non validi." };
  }

  if (!eventId || previousStates.length === 0) {
    return { status: "error", message: "Non c'è una modifica massiva da annullare." };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const invitationStates = previousStates.filter((item) => item.rowType === "invitation");
    const proposalStates = previousStates.filter((item) => item.rowType === "proposal");
    const invitationIds = invitationStates.map((item) => item.id);
    const currentInvitationStatusById = new Map<number, string>();
    if (invitationIds.length > 0) {
      const { data: rows, error: rowsError } = await supabase
        .from("event_invitations")
        .select("id,invitation_status")
        .eq("event_id", eventId)
        .in("id", invitationIds);
      if (rowsError) throw rowsError;
      if ((rows ?? []).length !== invitationIds.length) {
        return { status: "error", message: "Una o più righe non appartengono a questo evento." };
      }
      for (const row of rows ?? []) {
        currentInvitationStatusById.set(Number(row.id), String(row.invitation_status));
      }
    }

    for (const item of invitationStates) {
      if (item.status === "pending_approval") continue;
      const statusChanged = currentInvitationStatusById.get(item.id) !== item.status;
      const { error } = await supabase
        .from("event_invitations")
        .update({
          invitation_status: item.status,
          selected_by_profile_id: statusChanged ? profile.id : undefined,
          invitation_status_updated_at: statusChanged ? new Date().toISOString() : undefined,
          invitation_status_updated_by_profile_id: statusChanged ? profile.id : undefined,
          updated_by_profile_id: profile.id,
          invited_at: item.invitedAt,
          response_status: item.responseStatus,
          response_source: item.responseSource,
          attendance_status: item.attendanceStatus,
          response_note: item.responseNote,
          companion_count: item.companionCount,
          companion_names: item.companionCount > 0 ? item.companionNames : null,
          response_recorded_at: item.responseRecordedAt,
          response_recorded_by_profile_id: item.responseRecordedByProfileId,
        })
        .eq("event_id", eventId)
        .eq("id", item.id);
      if (error) throw error;
    }

    for (const item of proposalStates) {
      const { error: proposalError } = await supabase
        .from("invitation_proposals")
        .update({
          status: "pending",
          decided_by_profile_id: null,
          decided_at: null,
          decision_note: null,
        })
        .eq("event_id", eventId)
        .eq("contact_id", item.contactId)
        .in("id", item.proposalIds);
      if (proposalError) throw proposalError;

      const { error: deleteError } = await supabase
        .from("event_invitations")
        .delete()
        .eq("event_id", eventId)
        .eq("contact_id", item.contactId);
      if (deleteError) {
        await supabase
          .from("invitation_proposals")
          .update({
            status: "approved",
            decided_at: new Date().toISOString(),
          })
          .eq("event_id", eventId)
          .eq("contact_id", item.contactId)
          .in("id", item.proposalIds);
        throw deleteError;
      }
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/events");
    revalidatePath(`/dashboard/events/${eventId}`);
    return { status: "success", message: "Ultima modifica massiva annullata." };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
}

export async function removeInvitationAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  await requireManager();
  const invitationId = numberField(formData, "invitationId");
  const eventId = numberField(formData, "eventId");

  if (!invitationId || !eventId) {
    return { status: "error", message: "Invito non valido." };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { error } = await supabase.from("event_invitations").delete().eq("id", invitationId);
    if (error) throw error;
    revalidatePath("/dashboard/events");
    revalidatePath(`/dashboard/events/${eventId}`);
    return { status: "success", message: "Invitato rimosso dall'evento." };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
}
