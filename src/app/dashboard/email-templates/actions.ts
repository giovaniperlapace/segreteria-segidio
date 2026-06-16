"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth/profile";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { ArchiveActionState } from "../archive-actions";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function numberField(formData: FormData, key: string) {
  const value = Number(text(formData, key));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function friendlyTemplateError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : String(error);

  if (message.includes("email_templates_name_not_blank")) return "Inserisci un nome template.";
  if (message.includes("email_templates_subject_not_blank")) return "Inserisci un oggetto.";
  if (message.includes("email_templates_body_not_blank")) return "Inserisci il testo email.";
  if (message.includes("row-level security")) return "Non hai i permessi necessari per questa operazione.";

  console.error("Email template operation failed", error);
  return "Operazione template non riuscita. Controlla i dati e riprova.";
}

export async function createEmailTemplateAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  const profile = await requireManager();
  const name = text(formData, "name");
  const subject = text(formData, "subject");
  const bodyText = text(formData, "bodyText");

  if (!name || !subject || !bodyText) {
    return { status: "error", message: "Nome, oggetto e testo sono obbligatori." };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { error } = await supabase.from("email_templates").insert({
      name,
      subject,
      body_text: bodyText,
      active: formData.get("active") === "on",
      created_by_profile_id: profile.id,
      updated_by_profile_id: profile.id,
    });
    if (error) throw error;
    revalidatePath("/dashboard/email-templates");
    revalidatePath("/dashboard/events");
    return { status: "success", message: "Template email creato." };
  } catch (error) {
    return { status: "error", message: friendlyTemplateError(error) };
  }
}

export async function updateEmailTemplateAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  const profile = await requireManager();
  const templateId = numberField(formData, "templateId");
  const name = text(formData, "name");
  const subject = text(formData, "subject");
  const bodyText = text(formData, "bodyText");

  if (!templateId || !name || !subject || !bodyText) {
    return { status: "error", message: "Template non valido." };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { error } = await supabase
      .from("email_templates")
      .update({
        name,
        subject,
        body_text: bodyText,
        active: formData.get("active") === "on",
        updated_by_profile_id: profile.id,
      })
      .eq("id", templateId);
    if (error) throw error;
    revalidatePath("/dashboard/email-templates");
    revalidatePath("/dashboard/events");
    return { status: "success", message: "Template email aggiornato." };
  } catch (error) {
    return { status: "error", message: friendlyTemplateError(error) };
  }
}
