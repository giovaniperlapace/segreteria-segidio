"use server";

import { revalidatePath } from "next/cache";
import { requireManager, requireProfile } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ArchiveActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const CONTACT_STATUSES = ["active", "standby"] as const;
const CONTACT_PRIORITIES = ["standard", "important", "critical"] as const;

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optionalText(formData: FormData, key: string) {
  return text(formData, key) || null;
}

function ids(formData: FormData, key: string) {
  return [...new Set(formData.getAll(key).map(Number).filter(Number.isSafeInteger))];
}

function friendlyError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : String(error);

  if (message.includes("groups_active_name_unique_idx")) {
    return "Esiste gia' un gruppo attivo con questo nome.";
  }
  if (message.includes("contact_languages_name_unique_idx")) {
    return "Esiste gia' una lingua con questo nome.";
  }
  if (message.includes("contacts_name_present")) {
    return "Inserisci almeno un nome, un cognome o un'istituzione.";
  }
  if (message.includes("row-level security")) {
    return "Non hai i permessi necessari per questa operazione.";
  }

  console.error("Archive operation failed", error);
  return "Operazione non riuscita. Controlla i dati e riprova.";
}

function contactInput(formData: FormData) {
  const status = text(formData, "status");
  const priority = text(formData, "priority");

  if (
    !CONTACT_STATUSES.includes(status as (typeof CONTACT_STATUSES)[number]) ||
    !CONTACT_PRIORITIES.includes(priority as (typeof CONTACT_PRIORITIES)[number])
  ) {
    throw new Error("INVALID_CONTACT_ENUM");
  }

  const input = {
    honorific_title: optionalText(formData, "honorificTitle"),
    first_name: text(formData, "firstName"),
    last_name: text(formData, "lastName"),
    institutional_role: optionalText(formData, "institutionalRole"),
    institution: optionalText(formData, "institution"),
    email: optionalText(formData, "email")?.toLowerCase() ?? null,
    phone: optionalText(formData, "phone"),
    mobile_phone: optionalText(formData, "mobilePhone"),
    address_line: optionalText(formData, "addressLine"),
    postal_code: optionalText(formData, "postalCode"),
    city: optionalText(formData, "city"),
    country: optionalText(formData, "country"),
    spoken_language: optionalText(formData, "spokenLanguage"),
    website: optionalText(formData, "website"),
    notes: optionalText(formData, "notes"),
    missing_data_notes: optionalText(formData, "missingDataNotes"),
    status: status as (typeof CONTACT_STATUSES)[number],
    priority: priority as (typeof CONTACT_PRIORITIES)[number],
  };

  if (!input.first_name && !input.last_name && !input.institution) {
    throw new Error("CONTACT_NAME_REQUIRED");
  }

  return input;
}

async function replaceAssociations(
  contactId: number,
  groupIds: number[],
  referenceIds: number[],
  actorProfileId: string,
) {
  const supabase = await createSupabaseServerClient();
  const { error: groupDeleteError } = await supabase
    .from("contact_groups")
    .delete()
    .eq("contact_id", contactId);
  if (groupDeleteError) throw groupDeleteError;

  if (groupIds.length > 0) {
    const { error } = await supabase.from("contact_groups").insert(
      groupIds.map((groupId) => ({
        contact_id: contactId,
        group_id: groupId,
        created_by_profile_id: actorProfileId,
      })),
    );
    if (error) throw error;
  }

  const { error: referenceDeleteError } = await supabase
    .from("contact_references")
    .delete()
    .eq("contact_id", contactId);
  if (referenceDeleteError) throw referenceDeleteError;

  if (referenceIds.length > 0) {
    const { error } = await supabase.from("contact_references").insert(
      referenceIds.map((referenceId, index) => ({
        contact_id: contactId,
        reference_id: referenceId,
        is_primary: index === 0,
        created_by_profile_id: actorProfileId,
      })),
    );
    if (error) throw error;
  }
}

export async function createContactAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  const profile = await requireManager();

  try {
    const supabase = await createSupabaseServerClient();
    const { data: contact, error } = await supabase
      .from("contacts")
      .insert({
        ...contactInput(formData),
        created_by_profile_id: profile.id,
        updated_by_profile_id: profile.id,
      })
      .select("id")
      .single();
    if (error) throw error;

    await replaceAssociations(
      contact.id,
      ids(formData, "groupIds"),
      ids(formData, "referenceIds"),
      profile.id,
    );

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/contacts");
    return { status: "success", message: "Contatto creato correttamente." };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
}

export async function updateContactAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  const profile = await requireProfile();
  const contactId = Number(text(formData, "contactId"));

  if (!Number.isSafeInteger(contactId)) {
    return { status: "error", message: "Contatto non valido." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("contacts")
      .update({ ...contactInput(formData), updated_by_profile_id: profile.id })
      .eq("id", contactId);
    if (error) throw error;

    if (profile.role === "manager") {
      await replaceAssociations(
        contactId,
        ids(formData, "groupIds"),
        ids(formData, "referenceIds"),
        profile.id,
      );
    }

    revalidatePath("/dashboard/contacts");
    return { status: "success", message: "Contatto aggiornato correttamente." };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
}

export async function createGroupAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  const manager = await requireManager();
  const name = text(formData, "name");
  if (!name) return { status: "error", message: "Il nome del gruppo e' obbligatorio." };

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("groups").insert({
      name,
      description: optionalText(formData, "description"),
      created_by_profile_id: manager.id,
    });
    if (error) throw error;
    revalidatePath("/dashboard/groups");
    revalidatePath("/dashboard/contacts");
    return { status: "success", message: "Gruppo creato correttamente." };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
}

export async function updateGroupAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  await requireManager();
  const groupId = Number(text(formData, "groupId"));
  const name = text(formData, "name");
  if (!Number.isSafeInteger(groupId) || !name) {
    return { status: "error", message: "Nome o gruppo non valido." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("groups")
      .update({
        name,
        description: optionalText(formData, "description"),
        active: formData.get("active") === "on",
      })
      .eq("id", groupId);
    if (error) throw error;
    revalidatePath("/dashboard/groups");
    revalidatePath("/dashboard/contacts");
    return { status: "success", message: "Gruppo aggiornato correttamente." };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
}

export async function createReferenceAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  const manager = await requireManager();
  const fullName = text(formData, "fullName");
  if (!fullName) {
    return { status: "error", message: "Il nome del riferimento e' obbligatorio." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("internal_references").insert({
      full_name: fullName,
      email: optionalText(formData, "email")?.toLowerCase() ?? null,
      phone: optionalText(formData, "phone"),
      notes: optionalText(formData, "notes"),
      created_by_profile_id: manager.id,
    });
    if (error) throw error;
    revalidatePath("/dashboard/references");
    revalidatePath("/dashboard/contacts");
    return { status: "success", message: "Riferimento creato correttamente." };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
}

export async function updateReferenceAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  await requireManager();
  const referenceId = Number(text(formData, "referenceId"));
  const fullName = text(formData, "fullName");
  if (!Number.isSafeInteger(referenceId) || !fullName) {
    return { status: "error", message: "Nome o riferimento non valido." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("internal_references")
      .update({
        full_name: fullName,
        email: optionalText(formData, "email")?.toLowerCase() ?? null,
        phone: optionalText(formData, "phone"),
        notes: optionalText(formData, "notes"),
        active: formData.get("active") === "on",
      })
      .eq("id", referenceId);
    if (error) throw error;
    revalidatePath("/dashboard/references");
    revalidatePath("/dashboard/contacts");
    return { status: "success", message: "Riferimento aggiornato correttamente." };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
}

export async function createLanguageAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  const manager = await requireManager();
  const name = text(formData, "name");
  const sortOrder = Number(text(formData, "sortOrder") || "100");
  if (!name) return { status: "error", message: "Il nome della lingua e' obbligatorio." };

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("contact_languages").insert({
      name,
      sort_order: Number.isSafeInteger(sortOrder) ? sortOrder : 100,
      created_by_profile_id: manager.id,
    });
    if (error) throw error;
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/contacts");
    return { status: "success", message: "Lingua aggiunta correttamente." };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
}

export async function updateLanguageAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  await requireManager();
  const languageId = Number(text(formData, "languageId"));
  const name = text(formData, "name");
  const sortOrder = Number(text(formData, "sortOrder") || "100");
  if (!Number.isSafeInteger(languageId) || !name) {
    return { status: "error", message: "Nome o lingua non validi." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("contact_languages")
      .update({
        name,
        sort_order: Number.isSafeInteger(sortOrder) ? sortOrder : 100,
        active: formData.get("active") === "on",
      })
      .eq("id", languageId);
    if (error) throw error;
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/contacts");
    return { status: "success", message: "Lingua aggiornata correttamente." };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
}
