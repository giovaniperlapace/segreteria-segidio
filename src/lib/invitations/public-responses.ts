import { parsePartResponses, describeParts, type EventPart, type PartResponse } from "./event-parts";
import { sendTransactionalEmail } from "@/lib/email/postmark";
import {
  appAbsoluteUrl,
  hashPublicResponseToken,
  PUBLIC_RESPONSE_CHOICE_LABELS,
  type PublicResponseChoice,
  type PublicResponseStatus,
} from "@/lib/email/public-response-links";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type ResponseTokenRow = {
  id: number;
  invitation_id: number;
  event_id: number;
  contact_id: number;
  expires_at: string | null;
  revoked_at: string | null;
  used_at: string | null;
};

type InvitationRow = {
  part_responses: PartResponse[];
  id: number;
  event_id: number;
  contact_id: number;
  invitation_status: string;
  response_source: string | null;
  companion_count: number;
  companion_names: string | null;
  response_status: "no_response" | "attending" | "declined" | "maybe";
  delegate_first_name: string | null;
  delegate_last_name: string | null;
  delegate_email: string | null;
  delegate_role: string | null;
};

type EventRow = {
  parts: EventPart[];
  id: number;
  title: string;
  starts_at: string;
  location: string | null;
};

type ContactRow = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  institution: string | null;
  email: string | null;
  email_2: string | null;
};

export type PublicResponseContext = {
  token: ResponseTokenRow;
  invitation: InvitationRow;
  event: EventRow;
  contact: ContactRow;
};

function contactName(contact: Pick<ContactRow, "first_name" | "last_name" | "institution">) {
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
    contact.institution ||
    "Invitato";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatPublicEventDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
}

export async function readPublicResponseContext(rawToken: string) {
  const token = rawToken.trim();
  if (!token) return null;

  const supabase = createSupabaseServiceClient();
  const { data: tokenRow, error: tokenError } = await supabase
    .from("invitation_response_tokens")
    .select("id,invitation_id,event_id,contact_id,expires_at,revoked_at,used_at")
    .eq("token_hash", hashPublicResponseToken(token))
    .maybeSingle();
  if (tokenError) throw tokenError;
  if (!tokenRow) return null;

  const typedToken = tokenRow as ResponseTokenRow;
  if (typedToken.revoked_at) return null;
  if (typedToken.expires_at && new Date(typedToken.expires_at).getTime() < Date.now()) return null;

  const [{ data: invitation, error: invitationError }, { data: event, error: eventError }, { data: contact, error: contactError }] =
    await Promise.all([
      supabase
        .from("event_invitations")
        .select("part_responses,id,event_id,contact_id,invitation_status,response_source,response_status,companion_count,companion_names,delegate_first_name,delegate_last_name,delegate_email,delegate_role")
        .eq("id", typedToken.invitation_id)
        .maybeSingle(),
      supabase
        .from("events")
        .select("parts,id,title,starts_at,location")
        .eq("id", typedToken.event_id)
        .maybeSingle(),
      supabase
        .from("contacts")
        .select("id,first_name,last_name,institution,email,email_2")
        .eq("id", typedToken.contact_id)
        .maybeSingle(),
    ]);
  if (invitationError) throw invitationError;
  if (eventError) throw eventError;
  if (contactError) throw contactError;
  if (!invitation || !event || !contact) return null;

  const typedInvitation = invitation as InvitationRow;
  if (
    Number(typedInvitation.event_id) !== Number(typedToken.event_id) ||
    Number(typedInvitation.contact_id) !== Number(typedToken.contact_id)
  ) {
    return null;
  }

  return {
    token: typedToken,
    invitation: typedInvitation,
    event: event as EventRow,
    contact: contact as ContactRow,
  } satisfies PublicResponseContext;
}

async function notifySelectedManagers(
  context: PublicResponseContext,
  response: PublicResponseChoice,
  delegate: PublicResponseDelegate | null,
  partsDescription?: string,
) {
  const supabase = createSupabaseServiceClient();
  const { data: managers, error } = await supabase
    .from("profiles")
    .select("email,full_name")
    .eq("role", "manager")
    .eq("active", true)
    .eq("receives_response_notifications", true)
    .not("email", "is", null);
  if (error) throw error;

  const managerEmails = [
    ...new Set(
      (managers ?? [])
        .map((manager) => String(manager.email ?? "").trim())
        .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
    ),
  ];
  if (managerEmails.length === 0) return;

  const dashboardUrl = appAbsoluteUrl(`/dashboard/events/${context.event.id}`);
  const name = contactName(context.contact);
  const responseLabel = PUBLIC_RESPONSE_CHOICE_LABELS[response];
  const eventDate = formatPublicEventDate(context.event.starts_at);
  const subject = `Risposta invito - ${context.event.title}`;
  const text = [
    "Segreteria Segidio",
    "",
    `${name} ha risposto: ${responseLabel}.`,
    "",
    partsDescription,
    `Evento: ${context.event.title}`,
    `Data: ${eventDate}`,
    context.event.location ? `Luogo: ${context.event.location}` : null,
    delegate ? `Delegato: ${delegate.firstName} ${delegate.lastName}` : null,
    delegate?.role ? `Ruolo/Carica delegato: ${delegate.role}` : null,
    delegate ? `Email delegato: ${delegate.email}` : null,
    "",
    `Apri la lista evento: ${dashboardUrl}`,
  ].filter(Boolean).join("\n");

  const notifications = await Promise.allSettled(managerEmails.map(to => sendTransactionalEmail({
    to,
    subject,
    text,
    html: `
      <div style="font-family: Arial, sans-serif; color: #172033; line-height: 1.6;">
        <h1 style="font-size: 20px; margin: 0 0 14px;">Nuova risposta ricevuta</h1>
        <p><strong>${escapeHtml(name)}</strong> ha risposto: <strong>${escapeHtml(responseLabel)}</strong>.</p>
        ${partsDescription ? `<p style="white-space: pre-line">${escapeHtml(partsDescription)}</p>` : ""}
        <p>
          Evento: <strong>${escapeHtml(context.event.title)}</strong><br>
          Data: ${escapeHtml(eventDate)}${context.event.location ? `<br>Luogo: ${escapeHtml(context.event.location)}` : ""}
          ${delegate ? `<br>Delegato: <strong>${escapeHtml(`${delegate.firstName} ${delegate.lastName}`)}</strong>${delegate.role ? `<br>Ruolo/Carica delegato: ${escapeHtml(delegate.role)}` : ""}<br>Email delegato: ${escapeHtml(delegate.email)}` : ""}
        </p>
        <p style="margin: 22px 0;">
          <a href="${dashboardUrl}" style="background: #1b3272; color: #ffffff; padding: 11px 16px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 700;">
            Apri la lista evento
          </a>
        </p>
      </div>
    `,
  })));
  if (notifications.some(result => result.status === "rejected")) {
    throw new Error("Invio di una o più notifiche Postmark non riuscito.");
  }
}

export type PublicResponseDelegate = {
  firstName: string;
  lastName: string;
  email: string;
  role?: string | null;
};

function normalizedDelegate(delegate: PublicResponseDelegate | null) {
  if (!delegate) return null;
  const value = {
    firstName: delegate.firstName.trim(),
    lastName: delegate.lastName.trim(),
    email: delegate.email.trim().toLowerCase(),
    role: delegate.role?.trim() || null,
  };
  if (
    !value.firstName ||
    !value.lastName ||
    value.firstName.length > 200 ||
    value.lastName.length > 200 ||
    value.email.length > 320 ||
    (value.role?.length ?? 0) > 200 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)
  ) {
    throw new Error("Dati del delegato non validi.");
  }
  return value;
}

export async function recordPublicInvitationResponse(
  rawToken: string,
  choice: PublicResponseChoice,
  rawDelegate: PublicResponseDelegate | null = null,
  companionCount = 0,
  companionNames: string | null = null,
) {
  const context = await readPublicResponseContext(rawToken);
  if (!context || context.event.parts.length) return null;

  const supabase = createSupabaseServiceClient();
  const response: PublicResponseStatus = choice === "delegated" ? "declined" : choice;
  const delegate = choice === "delegated" ? normalizedDelegate(rawDelegate) : null;
  if (choice === "delegated" && !delegate) throw new Error("Dati del delegato mancanti.");
  const { data, error } = await supabase.rpc("record_simple_public_response", {
    p_token_hash: hashPublicResponseToken(rawToken.trim()),
    p_response: response,
    p_delegate: delegate,
    p_count: companionCount,
    p_names: companionNames,
  });
  if (error) throw error;
  if (data === "unchanged") return "unchanged";
  if (data !== "recorded") return null;

  try {
    await notifySelectedManagers(context, choice, delegate, choice === "attending" ? `Accompagnatori: ${companionCount}` : undefined);
  } catch (error) {
    console.error("Public response notification failed", error);
  }

  return "recorded";
}

export async function recordPublicPartResponses(rawToken: string, value: string) {
  const context = await readPublicResponseContext(rawToken);
  if (!context || !context.event.parts.length) return false;
  const invitedParts = context.event.parts.filter(part => context.invitation.part_responses.some(row => row.id === part.id));
  const responses = parsePartResponses(value, invitedParts, true);
  if (responses.length !== invitedParts.length) throw new Error('Rispondi a tutte le parti invitate.');
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc('record_public_part_responses', { p_token_hash: hashPublicResponseToken(rawToken), p_responses: responses });
  if (error) throw error;
  if (!data) return false;
  try { await notifySelectedManagers(context, responses.some(r => r.response === 'attending' || r.response === 'delegated') ? 'attending' : responses.some(r => r.response === 'maybe') ? 'maybe' : 'declined', null, describeParts(invitedParts, responses)); }
  catch (error) { console.error('Public response notification failed', error); }
  return true;
}
