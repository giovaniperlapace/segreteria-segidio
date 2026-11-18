"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth/profile";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function saveMissingRecipientEmailAction(eventId: number, batchId: number, logId: number, value: string) {
  const profile = await requireManager();
  const email = value.trim();
  if (![eventId, batchId, logId].every(id => Number.isSafeInteger(id) && id > 0)) {
    return { status: "error" as const, message: "Destinatario non valido." };
  }
  // One mailbox only; reject trailing/consecutive dots and malformed domain labels.
  const [mailbox, domain, extra] = email.split("@");
  if (email.length > 254 || extra !== undefined || !mailbox || !domain ||
      !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(mailbox) ||
      mailbox.startsWith(".") || mailbox.endsWith(".") || mailbox.includes("..") ||
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain)) {
    return { status: "error" as const, message: "Inserisci un solo indirizzo email valido, senza punti finali o spazi." };
  }

  try {
    const db = createSupabaseServiceClient();
    const { data: log, error } = await db.from("email_logs").select("contact_id")
      .eq("id", logId).eq("batch_id", batchId).eq("event_id", eventId)
      .eq("status", "skipped").eq("to_email", "email-mancante").maybeSingle();
    if (error) throw error;
    if (!log?.contact_id) return { status: "error" as const, message: "Destinatario saltato non trovato." };
    const { data: contact, error: updateError } = await db.from("contacts")
      .update({ email, updated_by_profile_id: profile.id })
      .eq("id", log.contact_id).is("deleted_at", null).select("id,email").maybeSingle();
    if (updateError) throw updateError;
    if (!contact) return { status: "error" as const, message: "Contatto non più disponibile." };
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/contacts");
    revalidatePath("/dashboard/references");
    revalidatePath(`/dashboard/events/${eventId}`);
    return { status: "success" as const, email: String(contact.email) };
  } catch {
    return { status: "error" as const, message: "Impossibile salvare l’email. Riprova." };
  }
}
