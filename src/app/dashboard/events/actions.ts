"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth/profile";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { ArchiveActionState } from "../archive-actions";

const EVENT_STATUSES = ["draft", "active", "concluded", "archived"] as const;
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
  await requireManager();
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
    });
    if (error) throw error;
    revalidatePath("/dashboard/events");
    revalidatePath(`/dashboard/events/${eventId}`);
    return { status: "success", message: "Invitato aggiunto all'evento." };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
}

export async function updateInvitationAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  await requireManager();
  const invitationId = numberField(formData, "invitationId");
  const eventId = numberField(formData, "eventId");
  const response = responseStatus(text(formData, "responseStatus"));
  const attendance = attendanceStatus(text(formData, "attendanceStatus"));

  if (!invitationId || !eventId || !response || !attendance) {
    return { status: "error", message: "Invito non valido." };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const attentionNote = optionalText(formData, "attentionNote");
    const { error } = await supabase
      .from("event_invitations")
      .update({
        response_status: response,
        attendance_status: attendance,
        attention_flag: formData.get("attentionFlag") === "on",
        attention_note: attentionNote,
        notes: optionalText(formData, "notes"),
        response_recorded_at: response === "no_response" ? null : new Date().toISOString(),
      })
      .eq("id", invitationId);
    if (error) throw error;
    revalidatePath("/dashboard/events");
    revalidatePath(`/dashboard/events/${eventId}`);
    return { status: "success", message: "Invito aggiornato." };
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
