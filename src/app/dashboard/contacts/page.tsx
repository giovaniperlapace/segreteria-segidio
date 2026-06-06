import Link from "next/link";
import { requireProfile } from "@/lib/auth/profile";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { ContactManagement, type ContactRecord } from "./contact-management";
import { CONTACT_COLUMNS } from "./contact-data";

export const dynamic = "force-dynamic";

const CONTACT_PAGE_SIZE = 100;

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

  let missingIds: Set<number> | null = null;
  if (missing === "yes" || missing === "no") {
    const missingRowsForFilter = await fetchAllSupabaseRows(() =>
      supabase.from("contacts_missing_required_data").select("id"),
    );
    missingIds = new Set(missingRowsForFilter.map((row) => Number(row.id)));
  }

  const hasReferenceFilter = Number.isSafeInteger(referenceId) && referenceId > 0;
  const contactSelect = [
    CONTACT_COLUMNS,
    groupIds.length > 0 ? "contact_groups!inner(group_id)" : "",
    hasReferenceFilter ? "contact_references!inner(reference_id)" : "",
  ]
    .filter(Boolean)
    .join(",");

  let contactsQuery = supabase
    .from("contacts")
    .select(contactSelect, { count: "exact" })
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
  if (groupIds.length > 0) {
    contactsQuery = contactsQuery.in("contact_groups.group_id", groupIds);
  }
  if (hasReferenceFilter) {
    contactsQuery = contactsQuery.eq("contact_references.reference_id", referenceId);
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

  const contacts = (contactsResult.data ?? []) as unknown as ContactRecord[];
  const currentContactIds = contacts.map((contact) => Number(contact.id));
  const [contactGroups, contactReferences, missingRows, eventInvitationRows] =
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
          fetchAllSupabaseRows(() =>
            supabase
              .from("event_invitations")
              .select("contact_id,response_status,attendance_status,events!inner(id,title,starts_at)")
              .in("contact_id", currentContactIds),
          ),
        ])
      : [[], [], [], []];

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
  const eventHistoryByContact = new Map<number, ContactRecord["event_history"]>();
  for (const row of eventInvitationRows) {
    const contactId = Number(row.contact_id);
    const event = Array.isArray(row.events) ? row.events[0] : row.events;
    if (!event) continue;
    eventHistoryByContact.set(contactId, [
      ...(eventHistoryByContact.get(contactId) ?? []),
      {
        event_id: Number(event.id),
        title: String(event.title),
        starts_at: String(event.starts_at),
        response_status: row.response_status,
        attendance_status: row.attendance_status,
      },
    ]);
  }
  for (const [contactId, items] of eventHistoryByContact) {
    eventHistoryByContact.set(
      contactId,
      items
        .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
        .slice(0, 12),
    );
  }

  const contactRecords = contacts.map((contact) => ({
    ...contact,
    group_ids: groupIdsByContact.get(Number(contact.id)) ?? [],
    reference_ids: referenceIdsByContact.get(Number(contact.id)) ?? [],
    missing_fields: missingByContact.get(Number(contact.id)) ?? [],
    event_history: eventHistoryByContact.get(Number(contact.id)) ?? [],
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
