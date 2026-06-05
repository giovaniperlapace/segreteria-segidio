import Link from "next/link";
import { requireProfile } from "@/lib/auth/profile";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { ContactManagement, type ContactRecord } from "./contact-management";

export const dynamic = "force-dynamic";

const CONTACT_PAGE_SIZE = 100;
const CONTACT_COLUMNS =
  "id,legacy_access_old_archive_id,honorific_title,honorific_title_english,honorific_title_invitation,first_name,last_name,legacy_description,institutional_role,institutional_role_english,institutional_role_invitation,institution,legacy_salutation,email,email_2,phone,phone_home,phone_office_2,mobile_phone,fax,fax_home,telex_office,address_line,postal_code,city,country,home_address_line,home_postal_code,home_city,home_province,home_country,office_name,office_address_line,office_postal_code,office_city,office_province,office_country,spoken_language,spoken_language_2,invitation_language,translation_language,religion,legacy_organization_id,legacy_organization_name,legacy_office_site,mail_address_preference,legacy_contacts_raw,accompanist,legacy_archive_type,legacy_created_at,legacy_updated_at,legacy_invitation_group,website,website_2,notes,missing_data_notes,status,priority";

type ContactsSearchParams = Record<string, string | string[] | undefined>;

function paramValue(searchParams: ContactsSearchParams, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function parsePage(searchParams: ContactsSearchParams) {
  const page = Number(paramValue(searchParams, "page"));
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function parseGroupIds(searchParams: ContactsSearchParams) {
  return paramValue(searchParams, "groups")
    .split(",")
    .map(Number)
    .filter((value) => Number.isSafeInteger(value) && value > 0);
}

function sanitizeSearchTerm(value: string) {
  return value.trim().replace(/[%*,]/g, " ").replace(/\s+/g, " ");
}

function parseStatusFilter(searchParams: ContactsSearchParams) {
  const status = paramValue(searchParams, "status");
  return status === "all" || status === "standby" ? status : "active";
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams?: Promise<ContactsSearchParams>;
}) {
  const profile = await requireProfile();
  const supabase =
    profile.role === "manager"
      ? createSupabaseServiceClient()
      : await createSupabaseServerClient();
  const params = (await searchParams) ?? {};
  const page = parsePage(params);
  const search = sanitizeSearchTerm(paramValue(params, "q"));
  const status = parseStatusFilter(params);
  const priority = paramValue(params, "priority");
  const referenceId = Number(paramValue(params, "referenceId"));
  const missing = paramValue(params, "missing");
  const groupIds = parseGroupIds(params);
  const from = (page - 1) * CONTACT_PAGE_SIZE;
  const to = from + CONTACT_PAGE_SIZE - 1;

  let relationFilterActive = false;
  const contactIdsFromRelations = new Set<number>();

  if (groupIds.length > 0) {
    relationFilterActive = true;
    const groupRelations = await fetchAllSupabaseRows(() =>
      supabase
        .from("contact_groups")
        .select("contact_id")
        .in("group_id", groupIds),
    );
    for (const relation of groupRelations) {
      contactIdsFromRelations.add(Number(relation.contact_id));
    }
  }

  if (Number.isSafeInteger(referenceId) && referenceId > 0) {
    const referenceRelations = await fetchAllSupabaseRows(() =>
      supabase
        .from("contact_references")
        .select("contact_id")
        .eq("reference_id", referenceId),
    );
    const referenceContactIds = new Set(referenceRelations.map((relation) => Number(relation.contact_id)));

    if (relationFilterActive) {
      for (const contactId of [...contactIdsFromRelations]) {
        if (!referenceContactIds.has(contactId)) {
          contactIdsFromRelations.delete(contactId);
        }
      }
    } else {
      relationFilterActive = true;
      for (const contactId of referenceContactIds) {
        contactIdsFromRelations.add(contactId);
      }
    }
  }

  let missingIds: Set<number> | null = null;
  if (missing === "yes" || missing === "no") {
    const missingRowsForFilter = await fetchAllSupabaseRows(() =>
      supabase.from("contacts_missing_required_data").select("id"),
    );
    missingIds = new Set(missingRowsForFilter.map((row) => Number(row.id)));
  }

  let contactsQuery = supabase
    .from("contacts")
    .select(CONTACT_COLUMNS, { count: "exact" })
    .is("deleted_at", null);

  if (search) {
    const pattern = `%${search}%`;
    contactsQuery = contactsQuery.or(
      [
        `first_name.ilike.${pattern}`,
        `last_name.ilike.${pattern}`,
        `institution.ilike.${pattern}`,
        `institutional_role.ilike.${pattern}`,
        `email.ilike.${pattern}`,
        `email_2.ilike.${pattern}`,
        `city.ilike.${pattern}`,
        `country.ilike.${pattern}`,
      ].join(","),
    );
  }
  if (status === "active" || status === "standby") {
    contactsQuery = contactsQuery.eq("status", status);
  }
  if (priority === "standard" || priority === "important" || priority === "critical") {
    contactsQuery = contactsQuery.eq("priority", priority);
  }
  if (relationFilterActive) {
    contactsQuery =
      contactIdsFromRelations.size > 0
        ? contactsQuery.in("id", [...contactIdsFromRelations])
        : contactsQuery.in("id", [-1]);
  }
  if (missingIds) {
    if (missing === "yes") {
      contactsQuery = missingIds.size > 0 ? contactsQuery.in("id", [...missingIds]) : contactsQuery.in("id", [-1]);
    } else if (missingIds.size > 0) {
      contactsQuery = contactsQuery.not("id", "in", `(${[...missingIds].join(",")})`);
    }
  }

  const [contactsResult, groupsResult, referencesResult, languagesResult] = await Promise.all([
    contactsQuery
      .order("last_name", { ascending: true, nullsFirst: false })
      .order("first_name", { ascending: true, nullsFirst: false })
      .range(from, to),
    supabase.from("groups").select("id,name,active").order("active", { ascending: false }).order("name"),
    supabase
      .from("internal_references")
      .select("id,full_name,active")
      .is("deleted_at", null)
      .order("active", { ascending: false })
      .order("full_name"),
    supabase
      .from("contact_languages")
      .select("id,name,active,sort_order")
      .order("active", { ascending: false })
      .order("sort_order")
      .order("name"),
  ]);

  for (const result of [contactsResult, groupsResult, referencesResult, languagesResult]) {
    if (result.error) throw result.error;
  }

  const contacts = contactsResult.data ?? [];
  const currentContactIds = contacts.map((contact) => Number(contact.id));
  const [contactGroups, contactReferences, missingRows] =
    currentContactIds.length > 0
      ? await Promise.all([
          fetchAllSupabaseRows(() =>
            supabase
              .from("contact_groups")
              .select("contact_id,group_id")
              .in("contact_id", currentContactIds),
          ),
          fetchAllSupabaseRows(() =>
            supabase
              .from("contact_references")
              .select("contact_id,reference_id")
              .in("contact_id", currentContactIds),
          ),
          fetchAllSupabaseRows(() =>
            supabase
              .from("contacts_missing_required_data")
              .select("id,missing_fields")
              .in("id", currentContactIds),
          ),
        ])
      : [[], [], []];

  const groupIdsByContact = new Map<number, number[]>();
  for (const relation of contactGroups) {
    groupIdsByContact.set(Number(relation.contact_id), [
      ...(groupIdsByContact.get(Number(relation.contact_id)) ?? []),
      Number(relation.group_id),
    ]);
  }
  const referenceIdsByContact = new Map<number, number[]>();
  for (const relation of contactReferences) {
    referenceIdsByContact.set(Number(relation.contact_id), [
      ...(referenceIdsByContact.get(Number(relation.contact_id)) ?? []),
      Number(relation.reference_id),
    ]);
  }
  const selectedReferenceIds = new Set(contactReferences.map((relation) => Number(relation.reference_id)));
  const missingByContact = new Map(missingRows.map((row) => [Number(row.id), row.missing_fields ?? []]));

  const contactRecords = contacts.map((contact) => ({
    ...contact,
    group_ids: groupIdsByContact.get(Number(contact.id)) ?? [],
    reference_ids: referenceIdsByContact.get(Number(contact.id)) ?? [],
    missing_fields: missingByContact.get(Number(contact.id)) ?? [],
  })) as ContactRecord[];

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <Link href="/dashboard" className="text-sm font-semibold text-[#d43c2f] hover:underline">← Dashboard</Link>
          <h1 className="mt-3 text-3xl font-semibold text-[#1b3272]">Contatti</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {profile.role === "manager"
              ? "Gestisci l'archivio, le associazioni e i dati mancanti."
              : "Visualizza e aggiorna i contatti assegnati al tuo profilo."}
          </p>
        </header>
        <ContactManagement
          contacts={contactRecords}
          groups={(groupsResult.data ?? []).map((group) => ({ id: group.id, name: group.name, active: group.active }))}
          references={(referencesResult.data ?? [])
            .filter((reference) => reference.active || selectedReferenceIds.has(reference.id))
            .map((reference) => ({ id: reference.id, name: reference.full_name, active: reference.active }))}
          languages={(languagesResult.data ?? []).map((language) => ({
            id: language.id,
            name: language.name,
            active: language.active,
          }))}
          isManager={profile.role === "manager"}
          viewPreferenceKey={`contacts-view:${profile.id}`}
          totalContacts={contactsResult.count ?? contactRecords.length}
          page={page}
          pageSize={CONTACT_PAGE_SIZE}
          initialFilters={{
            search,
            status,
            priority,
            groupIds,
            referenceId: Number.isSafeInteger(referenceId) && referenceId > 0 ? String(referenceId) : "all",
            missing,
          }}
        />
      </div>
    </main>
  );
}
