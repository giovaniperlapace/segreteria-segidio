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

function parsePositiveInteger(searchParams: ContactsSearchParams, key: string) {
  const value = Number(paramValue(searchParams, key));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
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

function parseMatchMode(searchParams: ContactsSearchParams) {
  return paramValue(searchParams, "match") === "or" ? "or" : "and";
}

function parseDateFilter(searchParams: ContactsSearchParams, key: string) {
  const value = paramValue(searchParams, key);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function nextDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function contactMatchesSearch(contact: ContactRecord, search: string) {
  if (!search) return true;

  const term = search.toLowerCase();
  const haystack = [
    contact.first_name,
    contact.last_name,
    contact.institution,
    contact.institutional_role,
    contact.email,
    contact.email_2,
    contact.city,
    contact.country,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(term);
}

function contactMatchesDateRange(value: string, from: string, to: string) {
  const time = new Date(value).getTime();
  if (from && time < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && time >= new Date(`${nextDate(to)}T00:00:00`).getTime()) return false;
  return true;
}

function buildContactRecord(
  contact: ContactRecord,
  groupIdsByContact: Map<number, number[]>,
  referenceIdsByContact: Map<number, number[]>,
  missingByContact: Map<number, string[]>,
  eventHistoryByContact: Map<number, ContactRecord["event_history"]>,
) {
  const contactId = Number(contact.id);
  return {
    ...contact,
    group_ids: groupIdsByContact.get(contactId) ?? [],
    reference_ids: referenceIdsByContact.get(contactId) ?? [],
    missing_fields: missingByContact.get(contactId) ?? [],
    event_history: eventHistoryByContact.get(contactId) ?? [],
  } as ContactRecord;
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
  const openContactId = parsePositiveInteger(params, "contactId");
  const search = sanitizeSearchTerm(paramValue(params, "q"));
  const status = parseStatusFilter(params);
  const matchMode = parseMatchMode(params);
  const priority = paramValue(params, "priority");
  const referenceId = Number(paramValue(params, "referenceId"));
  const missing = paramValue(params, "missing");
  const groupIds = parseGroupIds(params);
  const createdFrom = parseDateFilter(params, "createdFrom");
  const createdTo = parseDateFilter(params, "createdTo");
  const updatedFrom = parseDateFilter(params, "updatedFrom");
  const updatedTo = parseDateFilter(params, "updatedTo");
  const from = (page - 1) * CONTACT_PAGE_SIZE;
  const hasReferenceFilter = Number.isSafeInteger(referenceId) && referenceId > 0;
  const hasPriorityFilter = priority === "standard" || priority === "important" || priority === "critical";
  const hasMissingFilter = missing === "yes" || missing === "no";
  const hasCreatedFilter = Boolean(createdFrom || createdTo);
  const hasUpdatedFilter = Boolean(updatedFrom || updatedTo);

  const [
    allContacts,
    groupsResult,
    referencesResult,
    languagesResult,
    allContactGroups,
    allContactReferences,
    allMissingRows,
  ] = await Promise.all([
    fetchAllSupabaseRows(() =>
      supabase
        .from("contacts")
        .select(CONTACT_COLUMNS)
        .is("deleted_at", null)
      .order("last_name", { ascending: true, nullsFirst: false })
        .order("first_name", { ascending: true, nullsFirst: false }),
    ),
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
    fetchAllSupabaseRows(() => supabase.from("contact_groups").select("contact_id,group_id")),
    fetchAllSupabaseRows(() => supabase.from("contact_references").select("contact_id,reference_id")),
    fetchAllSupabaseRows(() => supabase.from("contacts_missing_required_data").select("id,missing_fields")),
  ]);

  for (const result of [groupsResult, referencesResult, languagesResult]) {
    if (result.error) throw result.error;
  }

  const groupIdsByContact = new Map<number, number[]>();
  for (const relation of allContactGroups) {
    groupIdsByContact.set(Number(relation.contact_id), [
      ...(groupIdsByContact.get(Number(relation.contact_id)) ?? []),
      Number(relation.group_id),
    ]);
  }
  const referenceIdsByContact = new Map<number, number[]>();
  for (const relation of allContactReferences) {
    referenceIdsByContact.set(Number(relation.contact_id), [
      ...(referenceIdsByContact.get(Number(relation.contact_id)) ?? []),
      Number(relation.reference_id),
    ]);
  }
  const selectedReferenceIds = new Set(allContactReferences.map((relation) => Number(relation.reference_id)));
  const missingByContact = new Map(allMissingRows.map((row) => [Number(row.id), row.missing_fields ?? []]));

  const filteredContacts = ((allContacts ?? []) as unknown as ContactRecord[]).filter((contact) => {
    const contactId = Number(contact.id);
    const contactGroupIds = groupIdsByContact.get(contactId) ?? [];
    const contactReferenceIds = referenceIdsByContact.get(contactId) ?? [];
    const missingFields = missingByContact.get(contactId) ?? [];
    const baseStatusMatches = status === "active" ? contact.status === "active" : true;
    const criteria = [
      search ? contactMatchesSearch(contact, search) : null,
      status === "standby" ? contact.status === "standby" : null,
      hasPriorityFilter ? contact.priority === priority : null,
      groupIds.length > 0 ? groupIds.some((groupId) => contactGroupIds.includes(groupId)) : null,
      hasReferenceFilter ? contactReferenceIds.includes(referenceId) : null,
      hasMissingFilter ? (missing === "yes" ? missingFields.length > 0 : missingFields.length === 0) : null,
      hasCreatedFilter ? contactMatchesDateRange(contact.created_at, createdFrom, createdTo) : null,
      hasUpdatedFilter ? contactMatchesDateRange(contact.updated_at, updatedFrom, updatedTo) : null,
    ].filter((criterion): criterion is boolean => criterion !== null);

    if (criteria.length === 0) return baseStatusMatches;
    if (matchMode === "and") return baseStatusMatches && criteria.every(Boolean);
    return baseStatusMatches && criteria.some(Boolean);
  });

  const contacts = filteredContacts.slice(from, from + CONTACT_PAGE_SIZE);
  const openContact = openContactId
    ? ((allContacts ?? []) as unknown as ContactRecord[]).find(
        (contact) => Number(contact.id) === openContactId,
      ) ?? null
    : null;
  const currentContactIds = contacts.map((contact) => Number(contact.id));
  const eventContactIds = [
    ...new Set([
      ...currentContactIds,
      ...(openContact ? [Number(openContact.id)] : []),
    ]),
  ];
  const eventInvitationRows =
    eventContactIds.length > 0
      ? await fetchAllSupabaseRows(() =>
          supabase
            .from("event_invitations")
            .select("contact_id,response_status,attendance_status,events!inner(id,title,starts_at)")
            .in("contact_id", eventContactIds),
        )
      : [];

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

  const contactRecords = contacts.map((contact) =>
    buildContactRecord(
      contact,
      groupIdsByContact,
      referenceIdsByContact,
      missingByContact,
      eventHistoryByContact,
    ),
  );
  const initialSelectedContact = openContact
    ? buildContactRecord(
        openContact,
        groupIdsByContact,
        referenceIdsByContact,
        missingByContact,
        eventHistoryByContact,
      )
    : null;

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
          initialSelectedContact={initialSelectedContact}
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
          totalContacts={filteredContacts.length}
          page={page}
          pageSize={CONTACT_PAGE_SIZE}
          initialFilters={{
            search,
            status,
            matchMode,
            priority,
            groupIds,
            referenceId: Number.isSafeInteger(referenceId) && referenceId > 0 ? String(referenceId) : "all",
            missing,
            createdFrom,
            createdTo,
            updatedFrom,
            updatedTo,
          }}
        />
      </div>
    </main>
  );
}
