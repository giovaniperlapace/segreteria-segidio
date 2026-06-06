"use server";

import { revalidatePath } from "next/cache";
import { requireManager, requireProfile } from "@/lib/auth/profile";
import { findAuthUserByEmail } from "@/lib/auth/admin";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type ArchiveActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type ContactHistoryItem = {
  id: number;
  action: string;
  actorName: string;
  occurredAt: string;
  changedFields: string[];
};

export type ContactHistoryActionState =
  | { status: "success"; items: ContactHistoryItem[] }
  | { status: "error"; message: string };

const CONTACT_STATUSES = ["active", "standby"] as const;
const CONTACT_PRIORITIES = ["standard", "important", "critical"] as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_COLUMNS =
  "id,legacy_access_old_archive_id,honorific_title,honorific_title_english,honorific_title_invitation,first_name,last_name,legacy_description,institutional_role,institutional_role_english,institutional_role_invitation,institution,legacy_salutation,email,email_2,phone,phone_home,phone_office_2,mobile_phone,fax,fax_home,telex_office,address_line,postal_code,city,country,home_address_line,home_postal_code,home_city,home_province,home_country,office_name,office_address_line,office_postal_code,office_city,office_province,office_country,spoken_language,spoken_language_2,invitation_language,translation_language,religion,legacy_organization_id,legacy_organization_name,legacy_office_site,mail_address_preference,legacy_contacts_raw,accompanist,legacy_archive_type,legacy_created_at,legacy_updated_at,legacy_invitation_group,website,website_2,notes,missing_data_notes,status,priority";
const HISTORY_LIMIT = 6;
const HISTORY_FIELD_LABELS: Record<string, string> = {
  honorific_title: "titolo",
  first_name: "nome",
  last_name: "cognome",
  institutional_role: "carica",
  institution: "istituzione",
  email: "email",
  email_2: "email 2",
  phone: "telefono",
  phone_home: "telefono casa",
  mobile_phone: "cellulare",
  address_line: "indirizzo",
  postal_code: "CAP",
  city: "citta'",
  country: "paese",
  spoken_language: "lingua",
  website: "sito web",
  notes: "note",
  missing_data_notes: "note dati mancanti",
  status: "stato",
  priority: "priorita'",
  group_id: "gruppi",
  reference_id: "referenti",
  is_primary: "referente principale",
  deleted_at: "eliminazione",
};
const HISTORY_IGNORED_FIELDS = new Set([
  "created_at",
  "updated_at",
  "created_by_profile_id",
  "updated_by_profile_id",
  "deleted_by_profile_id",
]);
type ArchiveSupabaseClient =
  | Awaited<ReturnType<typeof createSupabaseServerClient>>
  | ReturnType<typeof createSupabaseServiceClient>;

export type ReferenceContactsActionState =
  | { status: "success"; contacts: unknown[] }
  | { status: "error"; message: string };

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optionalText(formData: FormData, key: string) {
  return text(formData, key) || null;
}

function ids(formData: FormData, key: string) {
  return [...new Set(formData.getAll(key).map(Number).filter(Number.isSafeInteger))];
}

async function archiveClientForProfile(profile: { role: string }) {
  return profile.role === "manager"
    ? createSupabaseServiceClient()
    : await createSupabaseServerClient();
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
    return "Questo referente e' gia' collegato a un altro utente.";
  }
  if (message.includes("REFERENCE_NOT_FOUND")) {
    return "Il referente selezionato non esiste piu'.";
  }

  console.error("Archive operation failed", error);
  return "Operazione non riuscita. Controlla i dati e riprova.";
}

function changedHistoryFields(
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
) {
  const keys = new Set([...Object.keys(oldData ?? {}), ...Object.keys(newData ?? {})]);
  return [...keys]
    .filter((key) => {
      if (HISTORY_IGNORED_FIELDS.has(key)) return false;
      return JSON.stringify(oldData?.[key] ?? null) !== JSON.stringify(newData?.[key] ?? null);
    })
    .map((key) => HISTORY_FIELD_LABELS[key] ?? key)
    .sort();
}

export async function loadContactHistoryAction(
  contactId: number,
): Promise<ContactHistoryActionState> {
  await requireManager();

  if (!Number.isSafeInteger(contactId) || contactId <= 0) {
    return { status: "error", message: "Contatto non valido." };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { data: logs, error: logsError } = await supabase
      .from("audit_logs")
      .select("id,action,old_data,new_data,actor_profile_id,occurred_at")
      .or(
        `and(table_name.eq.contacts,record_id.eq.${contactId}),and(table_name.eq.contact_groups,record_id.eq.${contactId}),and(table_name.eq.contact_references,record_id.eq.${contactId})`,
      )
      .order("occurred_at", { ascending: false })
      .limit(HISTORY_LIMIT);

    if (logsError) throw logsError;

    const actorIds = [
      ...new Set(
        (logs ?? [])
          .map((log) => log.actor_profile_id)
          .filter((actorId): actorId is string => Boolean(actorId)),
      ),
    ];
    const { data: profiles, error: profilesError } =
      actorIds.length > 0
        ? await supabase
            .from("profiles")
            .select("id,full_name,email")
            .in("id", actorIds)
        : { data: [], error: null };

    if (profilesError) throw profilesError;

    const profilesById = new Map(
      (profiles ?? []).map((profile) => [
        profile.id,
        profile.full_name || profile.email || "Utente senza nome",
      ]),
    );

    return {
      status: "success",
      items: (logs ?? []).map((log) => ({
        id: Number(log.id),
        action: String(log.action),
        actorName: log.actor_profile_id
          ? profilesById.get(log.actor_profile_id) ?? "Utente non trovato"
          : "Sistema / import",
        occurredAt: String(log.occurred_at),
        changedFields: changedHistoryFields(
          log.old_data as Record<string, unknown> | null,
          log.new_data as Record<string, unknown> | null,
        ),
      })),
    };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
}

export async function loadReferenceContactsAction(
  referenceId: number,
): Promise<ReferenceContactsActionState> {
  await requireManager();

  if (!Number.isSafeInteger(referenceId) || referenceId <= 0) {
    return { status: "error", message: "Referente non valido." };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const referenceRelations = await fetchAllSupabaseRows(() =>
      supabase
        .from("contact_references")
        .select("contact_id")
        .eq("reference_id", referenceId),
    );
    const contactIds = [...new Set(referenceRelations.map((relation) => Number(relation.contact_id)))];

    if (contactIds.length === 0) {
      return { status: "success", contacts: [] };
    }

    const { data: contacts, error: contactsError } = await supabase
      .from("contacts")
      .select(CONTACT_COLUMNS)
      .in("id", contactIds)
      .is("deleted_at", null)
      .eq("status", "active")
      .order("last_name")
      .order("first_name");

    if (contactsError) throw contactsError;

    const activeContactIds = (contacts ?? []).map((contact) => Number(contact.id));
    const [contactGroups, contactReferences, missingRows] =
      activeContactIds.length > 0
        ? await Promise.all([
            fetchAllSupabaseRows(() =>
              supabase
                .from("contact_groups")
                .select("contact_id,group_id")
                .in("contact_id", activeContactIds),
            ),
            fetchAllSupabaseRows(() =>
              supabase
                .from("contact_references")
                .select("contact_id,reference_id")
                .in("contact_id", activeContactIds),
            ),
            fetchAllSupabaseRows(() =>
              supabase
                .from("contacts_missing_required_data")
                .select("id,missing_fields")
                .in("id", activeContactIds),
            ),
          ])
        : [[], [], []];

    const groupIdsByContact = new Map<number, number[]>();
    for (const relation of contactGroups) {
      const contactId = Number(relation.contact_id);
      groupIdsByContact.set(contactId, [
        ...(groupIdsByContact.get(contactId) ?? []),
        Number(relation.group_id),
      ]);
    }

    const referenceIdsByContact = new Map<number, number[]>();
    for (const relation of contactReferences) {
      const contactId = Number(relation.contact_id);
      referenceIdsByContact.set(contactId, [
        ...(referenceIdsByContact.get(contactId) ?? []),
        Number(relation.reference_id),
      ]);
    }

    const missingByContact = new Map(
      missingRows.map((row) => [Number(row.id), row.missing_fields ?? []]),
    );

    return {
      status: "success",
      contacts: (contacts ?? []).map((contact) => ({
        ...contact,
        group_ids: groupIdsByContact.get(Number(contact.id)) ?? [],
        reference_ids: referenceIdsByContact.get(Number(contact.id)) ?? [],
        missing_fields: missingByContact.get(Number(contact.id)) ?? [],
      })),
    };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
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
    institution: optionalText(formData, "institution"),
    email: optionalText(formData, "email")?.toLowerCase() ?? null,
    email_2: optionalText(formData, "email2")?.toLowerCase() ?? null,
    phone: optionalText(formData, "phone"),
    phone_home: optionalText(formData, "phoneHome"),
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
  supabase: ArchiveSupabaseClient,
  contactId: number,
  groupIds: number[],
  referenceIds: number[],
  actorProfileId: string,
) {
  const [{ data: currentGroups, error: groupsReadError }, { data: currentReferences, error: referencesReadError }] =
    await Promise.all([
      supabase.from("contact_groups").select("group_id").eq("contact_id", contactId),
      supabase.from("contact_references").select("reference_id,is_primary").eq("contact_id", contactId),
    ]);

  if (groupsReadError) throw groupsReadError;
  if (referencesReadError) throw referencesReadError;

  const currentGroupIds = new Set((currentGroups ?? []).map((row) => Number(row.group_id)));
  const currentReferenceIds = new Set((currentReferences ?? []).map((row) => Number(row.reference_id)));
  const nextGroupIds = new Set(groupIds);
  const nextReferenceIds = new Set(referenceIds);
  const groupIdsToDelete = [...currentGroupIds].filter((groupId) => !nextGroupIds.has(groupId));
  const groupIdsToInsert = groupIds.filter((groupId) => !currentGroupIds.has(groupId));
  const referenceIdsToDelete = [...currentReferenceIds].filter(
    (referenceId) => !nextReferenceIds.has(referenceId),
  );
  const referenceIdsToInsert = referenceIds.filter((referenceId) => !currentReferenceIds.has(referenceId));
  const desiredPrimaryReferenceId = referenceIds[0] ?? null;
  const currentPrimaryReferenceId =
    currentReferences?.find((row) => row.is_primary)?.reference_id ?? null;

  const writes: PromiseLike<{ error: unknown }>[] = [];

  if (groupIdsToDelete.length > 0) {
    writes.push(
      supabase
        .from("contact_groups")
        .delete()
        .eq("contact_id", contactId)
        .in("group_id", groupIdsToDelete),
    );
  }

  if (groupIdsToInsert.length > 0) {
    writes.push(
      supabase.from("contact_groups").insert(
        groupIdsToInsert.map((groupId) => ({
          contact_id: contactId,
          group_id: groupId,
          created_by_profile_id: actorProfileId,
        })),
      ),
    );
  }

  if (referenceIdsToDelete.length > 0) {
    writes.push(
      supabase
        .from("contact_references")
        .delete()
        .eq("contact_id", contactId)
        .in("reference_id", referenceIdsToDelete),
    );
  }

  if (referenceIdsToInsert.length > 0) {
    writes.push(
      supabase.from("contact_references").insert(
        referenceIdsToInsert.map((referenceId) => ({
          contact_id: contactId,
          reference_id: referenceId,
          is_primary: referenceId === desiredPrimaryReferenceId,
          created_by_profile_id: actorProfileId,
        })),
      ),
    );
  }

  if (
    currentReferenceIds.size > 0 &&
    desiredPrimaryReferenceId &&
    currentPrimaryReferenceId !== desiredPrimaryReferenceId
  ) {
    writes.push(
      supabase
        .from("contact_references")
        .update({ is_primary: false })
        .eq("contact_id", contactId)
        .neq("reference_id", desiredPrimaryReferenceId),
      supabase
        .from("contact_references")
        .update({ is_primary: true })
        .eq("contact_id", contactId)
        .eq("reference_id", desiredPrimaryReferenceId),
    );
  }

  const results = await Promise.all(writes);
  for (const result of results) {
    if (result.error) throw result.error;
  }
}

export async function createContactAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  const profile = await requireManager();

  try {
    const supabase = await archiveClientForProfile(profile);
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
      supabase,
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
    const supabase = await archiveClientForProfile(profile);
    const { error } = await supabase
      .from("contacts")
      .update({ ...contactInput(formData), updated_by_profile_id: profile.id })
      .eq("id", contactId);
    if (error) throw error;

    if (profile.role === "manager") {
      await replaceAssociations(
        supabase,
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
    revalidatePath("/dashboard/settings");
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
    revalidatePath("/dashboard/settings");
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
    return { status: "error", message: "Il nome del referente e' obbligatorio." };
  }

  try {
    const supabase = createSupabaseServiceClient();
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
    return { status: "success", message: "Referente creato correttamente." };
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
    return { status: "error", message: "Nome o referente non valido." };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { data: currentReference, error: currentReferenceError } = await supabase
      .from("internal_references")
      .select("first_name,last_name,full_name,active")
      .eq("id", referenceId)
      .maybeSingle();

    if (currentReferenceError) throw currentReferenceError;

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

    const affectsContactOptions =
      !currentReference ||
      currentReference.first_name !== firstName ||
      (currentReference.last_name ?? "") !== (lastName || "") ||
      currentReference.full_name !== fullName ||
      currentReference.active !== (formData.get("active") === "on");

    revalidatePath("/dashboard/references");
    if (affectsContactOptions) {
      revalidatePath("/dashboard/contacts");
    }
    return { status: "success", message: "Referente aggiornato correttamente." };
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
    return { status: "error", message: "Referente non valido." };
  }
  if (text(formData, "confirmation") !== "ELIMINA") {
    return { status: "error", message: "Scrivi ELIMINA per confermare la cancellazione." };
  }

  try {
    const supabase = createSupabaseServiceClient();
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
    return { status: "success", message: "Referente eliminato dall'archivio operativo." };
  } catch (error) {
    return { status: "error", message: friendlyError(error) };
  }
}

export async function moveReferenceContactsAction(
  _previousState: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  const manager = await requireManager();
  const sourceReferenceId = Number(text(formData, "sourceReferenceId"));
  const targetReferenceId = Number(text(formData, "targetReferenceId"));
  const operation = text(formData, "operation");
  const contactIds = ids(formData, "contactIds");

  if (
    !Number.isSafeInteger(sourceReferenceId) ||
    !Number.isSafeInteger(targetReferenceId) ||
    sourceReferenceId <= 0 ||
    targetReferenceId <= 0
  ) {
    return { status: "error", message: "Referente di origine o destinazione non valido." };
  }
  if (sourceReferenceId === targetReferenceId) {
    return { status: "error", message: "Scegli un referente diverso da quello attuale." };
  }
  if (operation !== "copy" && operation !== "transfer") {
    return { status: "error", message: "Operazione non valida." };
  }
  if (contactIds.length === 0) {
    return { status: "error", message: "Seleziona almeno un contatto." };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { data: targetReference, error: targetReferenceError } = await supabase
      .from("internal_references")
      .select("id")
      .eq("id", targetReferenceId)
      .is("deleted_at", null)
      .maybeSingle();

    if (targetReferenceError) throw targetReferenceError;
    if (!targetReference) {
      return { status: "error", message: "Il referente di destinazione non esiste piu'." };
    }

    const sourceRelations = await fetchAllSupabaseRows(() =>
      supabase
        .from("contact_references")
        .select("contact_id,is_primary")
        .eq("reference_id", sourceReferenceId)
        .in("contact_id", contactIds),
    );
    const validContactIds = [...new Set(sourceRelations.map((row) => Number(row.contact_id)))];

    if (validContactIds.length === 0) {
      return {
        status: "error",
        message: "Nessuno dei contatti selezionati e' ancora collegato al referente attuale.",
      };
    }

    const existingTargetRelations = await fetchAllSupabaseRows(() =>
      supabase
        .from("contact_references")
        .select("contact_id")
        .eq("reference_id", targetReferenceId)
        .in("contact_id", validContactIds),
    );
    const existingTargetContactIds = new Set(
      existingTargetRelations.map((row) => Number(row.contact_id)),
    );
    const contactIdsToInsert = validContactIds.filter(
      (contactId) => !existingTargetContactIds.has(contactId),
    );
    const sourcePrimaryContactIds = new Set(
      sourceRelations
        .filter((row) => row.is_primary)
        .map((row) => Number(row.contact_id)),
    );

    if (operation === "transfer") {
      const { error: deleteError } = await supabase
        .from("contact_references")
        .delete()
        .eq("reference_id", sourceReferenceId)
        .in("contact_id", validContactIds);

      if (deleteError) throw deleteError;
    }

    if (contactIdsToInsert.length > 0) {
      const { error: insertError } = await supabase.from("contact_references").insert(
        contactIdsToInsert.map((contactId) => ({
          contact_id: contactId,
          reference_id: targetReferenceId,
          is_primary: operation === "transfer" && sourcePrimaryContactIds.has(contactId),
          created_by_profile_id: manager.id,
        })),
      );

      if (insertError) throw insertError;
    }

    if (operation === "transfer") {
      const primaryContactIdsAlreadyLinkedToTarget = validContactIds.filter(
        (contactId) =>
          existingTargetContactIds.has(contactId) && sourcePrimaryContactIds.has(contactId),
      );

      if (primaryContactIdsAlreadyLinkedToTarget.length > 0) {
        const { error: primaryError } = await supabase
          .from("contact_references")
          .update({ is_primary: true })
          .eq("reference_id", targetReferenceId)
          .in("contact_id", primaryContactIdsAlreadyLinkedToTarget);

        if (primaryError) throw primaryError;
      }
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/contacts");
    revalidatePath("/dashboard/references");

    const movedCount = validContactIds.length;
    return {
      status: "success",
      message:
        operation === "copy"
          ? `${movedCount} contatti copiati sul referente selezionato.`
          : `${movedCount} contatti trasferiti al referente selezionato.`,
    };
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
    return { status: "error", message: "Referente non valido." };
  }

  if (missingFields.length > 0) {
    return {
      status: "error",
      message: `Per convertire il referente in utente mancano: ${missingFields.join(", ")}.`,
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
      return { status: "error", message: "Il referente selezionato non esiste piu'." };
    }
    if (reference.profile_id) {
      return { status: "error", message: "Questo referente e' gia' collegato a un utente." };
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
        message: "Esiste gia' un utente con questa email, ma non e' un referente.",
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
        ? `${fullName} e' stato collegato all'utente referente esistente.`
        : `${fullName} e' ora un utente referente e puo' accedere ai contatti assegnati.`,
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
