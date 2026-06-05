"use server";

import { revalidatePath } from "next/cache";
import { requireManager, requireProfile } from "@/lib/auth/profile";
import { findAuthUserByEmail } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type ArchiveActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const CONTACT_STATUSES = ["active", "standby"] as const;
const CONTACT_PRIORITIES = ["standard", "important", "critical"] as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  if (message.includes("profiles_email_unique_idx")) {
    return "Esiste gia' un utente autorizzato con questa email.";
  }
  if (message.includes("REFERENCE_ALREADY_LINKED")) {
    return "Questo riferimento e' gia' collegato a un altro utente.";
  }
  if (message.includes("REFERENCE_NOT_FOUND")) {
    return "Il riferimento selezionato non esiste piu'.";
  }

  console.error("Archive operation failed", error);
  return "Operazione non riuscita. Controlla i dati e riprova.";
}

function splitReferenceName(fullName: string) {
  const normalized = fullName.replace(/\s+/g, " ").trim();
  if (!normalized) return { firstName: "", lastName: "" };

  const parts = normalized.split(" ");
  if (parts.length < 2) return { firstName: normalized, lastName: "" };

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1) ?? "",
  };
}

function referenceNameInput(formData: FormData) {
  const fallback = splitReferenceName(text(formData, "fullName"));
  const firstName = text(formData, "firstName") || fallback.firstName;
  const lastName = text(formData, "lastName") || fallback.lastName;
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  return { firstName, lastName, fullName };
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
    institutional_role_english: optionalText(formData, "institutionalRoleEnglish"),
    institutional_role_invitation: optionalText(formData, "institutionalRoleInvitation"),
    institution: optionalText(formData, "institution"),
    legacy_description: optionalText(formData, "legacyDescription"),
    legacy_salutation: optionalText(formData, "legacySalutation"),
    email: optionalText(formData, "email")?.toLowerCase() ?? null,
    email_2: optionalText(formData, "email2")?.toLowerCase() ?? null,
    phone: optionalText(formData, "phone"),
    phone_home: optionalText(formData, "phoneHome"),
    mobile_phone: optionalText(formData, "mobilePhone"),
    fax: optionalText(formData, "fax"),
    fax_home: optionalText(formData, "faxHome"),
    address_line: optionalText(formData, "addressLine"),
    postal_code: optionalText(formData, "postalCode"),
    city: optionalText(formData, "city"),
    country: optionalText(formData, "country"),
    home_address_line: optionalText(formData, "homeAddressLine"),
    home_city: optionalText(formData, "homeCity"),
    office_name: optionalText(formData, "officeName"),
    office_address_line: optionalText(formData, "officeAddressLine"),
    office_city: optionalText(formData, "officeCity"),
    office_country: optionalText(formData, "officeCountry"),
    spoken_language: optionalText(formData, "spokenLanguage"),
    spoken_language_2: optionalText(formData, "spokenLanguage2"),
    invitation_language: optionalText(formData, "invitationLanguage"),
    website: optionalText(formData, "website"),
    accompanist: optionalText(formData, "accompanist"),
    legacy_invitation_group: optionalText(formData, "legacyInvitationGroup"),
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

export async function deleteContactAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  const manager = await requireManager();
  const contactId = Number(text(formData, "contactId"));

  if (!Number.isSafeInteger(contactId)) {
    return { status: "error", message: "Contatto non valido." };
  }
  if (text(formData, "confirmation") !== "ELIMINA") {
    return { status: "error", message: "Scrivi ELIMINA per confermare la cancellazione." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("contacts")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by_profile_id: manager.id,
        updated_by_profile_id: manager.id,
      })
      .eq("id", contactId)
      .is("deleted_at", null);

    if (error) throw error;

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/contacts");
    revalidatePath("/dashboard/references");
    return { status: "success", message: "Contatto eliminato dall'archivio operativo." };
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
  const { firstName, lastName, fullName } = referenceNameInput(formData);
  if (!firstName) {
    return { status: "error", message: "Il nome del riferimento e' obbligatorio." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("internal_references").insert({
      first_name: firstName,
      last_name: lastName || null,
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
  const { firstName, lastName, fullName } = referenceNameInput(formData);
  if (!Number.isSafeInteger(referenceId) || !firstName) {
    return { status: "error", message: "Nome o riferimento non valido." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("internal_references")
      .update({
        first_name: firstName,
        last_name: lastName || null,
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

export async function deleteReferenceAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  const manager = await requireManager();
  const referenceId = Number(text(formData, "referenceId"));

  if (!Number.isSafeInteger(referenceId)) {
    return { status: "error", message: "Riferimento non valido." };
  }
  if (text(formData, "confirmation") !== "ELIMINA") {
    return { status: "error", message: "Scrivi ELIMINA per confermare la cancellazione." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("internal_references")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by_profile_id: manager.id,
        active: false,
      })
      .eq("id", referenceId)
      .is("deleted_at", null);

    if (error) throw error;

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/contacts");
    revalidatePath("/dashboard/references");
    revalidatePath("/dashboard/users");
    return { status: "success", message: "Riferimento eliminato dall'archivio operativo." };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
}

export async function convertReferenceToUserAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  const manager = await requireManager();
  const referenceId = Number(text(formData, "referenceId"));
  const { firstName, lastName, fullName } = referenceNameInput(formData);
  const email = optionalText(formData, "email")?.toLowerCase() ?? "";
  const missingFields = [
    firstName ? null : "nome",
    lastName ? null : "cognome",
    EMAIL_PATTERN.test(email) ? null : "email valida",
  ].filter(Boolean);

  if (!Number.isSafeInteger(referenceId)) {
    return { status: "error", message: "Riferimento non valido." };
  }

  if (missingFields.length > 0) {
    return {
      status: "error",
      message: `Per convertire il riferimento in utente mancano: ${missingFields.join(", ")}.`,
    };
  }

  try {
    const service = createSupabaseServiceClient();
    const { data: reference, error: referenceError } = await service
      .from("internal_references")
      .select("id,profile_id")
      .eq("id", referenceId)
      .maybeSingle();

    if (referenceError) throw referenceError;
    if (!reference) {
      return { status: "error", message: "Il riferimento selezionato non esiste piu'." };
    }
    if (reference.profile_id) {
      return { status: "error", message: "Questo riferimento e' gia' collegato a un utente." };
    }

    const { data: existingProfile, error: profileError } = await service
      .from("profiles")
      .select("id,role,active")
      .eq("email", email)
      .maybeSingle();

    if (profileError) throw profileError;
    if (existingProfile && existingProfile.role !== "reference") {
      return {
        status: "error",
        message: "Esiste gia' un utente con questa email, ma non e' un riferimento.",
      };
    }

    let targetProfileId = existingProfile?.id ?? null;
    if (!targetProfileId) {
      let authUser = await findAuthUserByEmail(email);
      if (!authUser) {
        const { data, error } = await service.auth.admin.createUser({
          email,
          email_confirm: true,
        });
        if (error) throw error;
        authUser = data.user;
      }
      targetProfileId = authUser.id;
    }

    const { error } = await service.rpc("admin_manage_profile", {
      actor_profile_id: manager.id,
      target_profile_id: targetProfileId,
      target_email: email,
      target_first_name: firstName,
      target_last_name: lastName,
      target_role: "reference",
      target_active: true,
      target_reference_id: referenceId,
    });

    if (error) throw error;

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/users");
    revalidatePath("/dashboard/references");
    revalidatePath("/dashboard/contacts");

    return {
      status: "success",
      message: existingProfile
        ? `${fullName} e' stato collegato all'utente riferimento esistente.`
        : `${fullName} e' ora un utente riferimento e puo' accedere ai contatti assegnati.`,
    };
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
