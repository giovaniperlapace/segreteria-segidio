"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth/profile";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { fetchAllSupabaseRows, fetchSupabaseRowsForIds } from "@/lib/supabase/fetch-all";
import { invitationRecipients, invitationRecipientContact } from "@/lib/email/invitation-recipients";
import { renderEmailTemplate, plainTextToHtml, type EmailTemplateContext } from "@/lib/email/templates";
import type { EventPart, PartResponse } from "@/lib/invitations/event-parts";

export async function prepareCorrectedRecipientsAction(eventId: number, batchId: number) {
  const profile = await requireManager();
  if (![eventId, batchId].every(id => Number.isSafeInteger(id) && id > 0)) {
    return { status: "error" as const, message: "Blocco non valido." };
  }
  try {
    const db = createSupabaseServiceClient();
    const { data: source, error } = await db.from("email_batches")
      .select("id,template_id,created_at,status").eq("id", batchId).eq("event_id", eventId).maybeSingle();
    if (error) throw error;
    if (!source) return { status: "error" as const, message: "Blocco non trovato." };
    if (source.status === "sending") return { status: "error" as const, message: "Attendi la conclusione dell’invio in corso." };
    const [template, event, badges, originals] = await Promise.all([
      db.from("email_templates").select("subject,body_text,updated_at").eq("id", source.template_id).single(),
      db.from("events").select("id,title,starts_at,location,parts").eq("id", eventId).single(),
      db.from("email_logs").select("id").eq("batch_id", batchId).not("personalized_badge", "is", null).limit(1),
      fetchAllSupabaseRows(() => db.from("email_logs").select("id,invitation_id")
        .eq("batch_id", batchId).eq("event_id", eventId).eq("status", "skipped")
        .eq("to_email", "email-mancante").order("id")),
    ]);
    if (template.error || event.error || badges.error) throw template.error || event.error || badges.error;
    // Older batches do not retain the selected event-part filter. Do not broaden it.
    if ((event.data.parts as EventPart[]).length) return { status: "error" as const, message: "Per questo evento composto prepara un nuovo invio dal pannello Email inviti, scegliendo le parti e i destinatari desiderati." };
    if (badges.data?.length) return { status: "error" as const, message: "Il blocco contiene badge personalizzati: prepara un nuovo invio dal pannello Email inviti per generare anche i badge dei contatti corretti." };
    if (new Date(template.data.updated_at) > new Date(source.created_at)) {
      return { status: "error" as const, message: "Il template è stato modificato dopo l’invio originale. Prepara un nuovo invio dal pannello Email inviti per verificarne il testo." };
    }
    if (!originals.length) return { status: "success" as const, message: "Nessuna email mancante da recuperare.", count: 0 };
    const rows = await fetchSupabaseRowsForIds(originals.map(row => row.invitation_id), ids =>
      db.from("event_invitations").select(
        "id,updated_at,part_responses,delegate_email,delegate_first_name,delegate_last_name,delegate_role,contacts!inner(first_name,last_name,honorific_title,honorific_title_invitation,institutional_role,institutional_role_invitation,institution,legacy_salutation,email,email_2,updated_at,deleted_at)"
      ).eq("event_id", eventId).in("id", ids).in("invitation_status", ["selected", "invited"]).order("id"));
    const messages = [];
    const seen = new Set<number>();
    for (const original of originals) {
      if (seen.has(original.invitation_id)) continue;
      seen.add(original.invitation_id);
      const row = rows.find(item => item.id === original.invitation_id);
      if (!row) continue;
      const contact = (Array.isArray(row.contacts) ? row.contacts[0] : row.contacts) as EmailTemplateContext["contact"] & { updated_at: string; deleted_at: string | null };
      if (!contact || contact.deleted_at) continue;
      const invitation = { ...row, part_responses: row.part_responses as PartResponse[] };
      const recipients = invitationRecipients(invitation, contact, []).filter(email => {
        const [mailbox, domain] = email.split("@");
        return email.length <= 254 && !mailbox.startsWith(".") && !mailbox.endsWith(".") &&
          !mailbox.includes("..") && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain);
      });
      for (const recipient of recipients) {
        const context = { event: event.data, contact: invitationRecipientContact(invitation, contact, [], recipient) };
        const titles = (event.data.parts as EventPart[]).filter(part => invitation.part_responses.some(p => p.id === part.id)).map(part => part.title);
        const body = [renderEmailTemplate(template.data.body_text, context),
          titles.length ? `L’invito comprende:\n${titles.map(title => `• ${title}`).join("\n")}` : ""].filter(Boolean).join("\n\n");
        messages.push({ source_log_id: original.id, to_email: recipient,
          contact_updated_at: contact.updated_at, invitation_updated_at: row.updated_at,
          subject: renderEmailTemplate(template.data.subject, context), rendered_text: body, rendered_html: plainTextToHtml(body) });
      }
    }
    const result = await db.rpc("prepare_corrected_email_recipients", {
      p_event_id: eventId, p_source_batch_id: batchId, p_actor: profile.id, p_messages: messages,
    });
    if (result.error) throw result.error;
    const prepared = result.data as { batch_id: number | null; count: number };
    revalidatePath(`/dashboard/events/${eventId}`);
    return { status: "success" as const, count: prepared.count,
      message: prepared.count ? `Preparato il blocco #${prepared.batch_id} con ${prepared.count} email e gli allegati originali. Chiudi l’elenco, controlla “Vedi testo” nel nuovo blocco e premi “Invia tutte”.`
        : "Nessun nuovo indirizzo da preparare: i contatti sono ancora senza email oppure hanno già un invio preparato o effettuato." };
  } catch {
    return { status: "error" as const, message: "Impossibile preparare il recupero. Riprova; nessuna email è stata inviata." };
  }
}
