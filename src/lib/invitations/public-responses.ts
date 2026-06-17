import { sendSmtpEmail } from "@/lib/email/gmail";
import {
  appAbsoluteUrl,
  hashPublicResponseToken,
  PUBLIC_RESPONSE_LABELS,
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
  id: number;
  event_id: number;
  contact_id: number;
  invitation_status: string;
  response_status: "no_response" | "attending" | "declined" | "maybe";
};

type EventRow = {
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

export function publicContactName(contact: Pick<ContactRow, "first_name" | "last_name" | "institution">) {
  return contactName(contact);
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
        .select("id,event_id,contact_id,invitation_status,response_status")
        .eq("id", typedToken.invitation_id)
        .maybeSingle(),
      supabase
        .from("events")
        .select("id,title,starts_at,location")
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

async function notifyManagers(context: PublicResponseContext, response: PublicResponseStatus) {
  const supabase = createSupabaseServiceClient();
  const { data: managers, error } = await supabase
    .from("profiles")
    .select("email,full_name")
    .eq("role", "manager")
    .eq("active", true)
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
  const responseLabel = PUBLIC_RESPONSE_LABELS[response];
  const eventDate = formatPublicEventDate(context.event.starts_at);
  const subject = `Risposta invito - ${context.event.title}`;
  const text = [
    "Segreteria Segidio",
    "",
    `${name} ha risposto: ${responseLabel}.`,
    "",
    `Evento: ${context.event.title}`,
    `Data: ${eventDate}`,
    context.event.location ? `Luogo: ${context.event.location}` : null,
    "",
    `Apri la lista evento: ${dashboardUrl}`,
  ].filter(Boolean).join("\n");

  await sendSmtpEmail({
    to: managerEmails.join(", "),
    subject,
    text,
    html: `
      <div style="font-family: Arial, sans-serif; color: #172033; line-height: 1.6;">
        <h1 style="font-size: 20px; margin: 0 0 14px;">Nuova risposta ricevuta</h1>
        <p><strong>${escapeHtml(name)}</strong> ha risposto: <strong>${escapeHtml(responseLabel)}</strong>.</p>
        <p>
          Evento: <strong>${escapeHtml(context.event.title)}</strong><br>
          Data: ${escapeHtml(eventDate)}${context.event.location ? `<br>Luogo: ${escapeHtml(context.event.location)}` : ""}
        </p>
        <p style="margin: 22px 0;">
          <a href="${dashboardUrl}" style="background: #1b3272; color: #ffffff; padding: 11px 16px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 700;">
            Apri la lista evento
          </a>
        </p>
      </div>
    `,
  });
}

export async function recordPublicInvitationResponse(rawToken: string, response: PublicResponseStatus) {
  const context = await readPublicResponseContext(rawToken);
  if (!context) return null;

  const supabase = createSupabaseServiceClient();
  const now = new Date().toISOString();
  const previousResponse = context.invitation.response_status;
  const { error: updateError } = await supabase
    .from("event_invitations")
    .update({
      invitation_status: "invited",
      response_status: response,
      response_source: "public_link",
      attendance_status: "unknown",
      response_note: null,
      companion_count: 0,
      companion_names: null,
      response_recorded_at: now,
      response_recorded_by_profile_id: null,
      invited_at: context.invitation.invitation_status === "invited" ? undefined : now,
    })
    .eq("id", context.invitation.id);
  if (updateError) throw updateError;

  const [{ error: historyError }, { error: tokenError }] = await Promise.all([
    supabase.from("invitation_responses").insert({
      invitation_id: context.invitation.id,
      event_id: context.event.id,
      contact_id: context.contact.id,
      response_status: response,
      source: "public_link",
      response_token_id: context.token.id,
      previous_response_status: previousResponse,
    }),
    supabase
      .from("invitation_response_tokens")
      .update({
        used_at: context.token.used_at ?? now,
        last_response_at: now,
      })
      .eq("id", context.token.id),
  ]);
  if (historyError) throw historyError;
  if (tokenError) throw tokenError;

  try {
    await notifyManagers(context, response);
  } catch (error) {
    console.error("Public response notification failed", error);
  }

  return {
    ...context,
    selectedResponse: response,
  };
}
