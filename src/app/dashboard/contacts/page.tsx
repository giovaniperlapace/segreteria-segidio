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

type ContactSearchRow = {
  contact: ContactRecord;
  total_count: number | null;
};

async function loadContactEventHistory(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  contactIds: number[],
) {
  if (contactIds.length === 0) {
    return new Map<number, ContactRecord["event_history"]>();
  }

  const eventInvitationRows = await fetchAllSupabaseRows(() =>
    supabase
      .from("event_invitations")
      .select("contact_id,response_status,attendance_status,events!inner(id,title,starts_at)")
      .in("contact_id", contactIds),
  );

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

  return eventHistoryByContact;
}

async function loadContactById(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  contactId: number,
) {
  const { data: contact, error } = await supabase
    .from("contacts")
    .select(CONTACT_COLUMNS)
    .eq("id", contactId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!contact) return null;

  const [contactGroups, contactReferences, missingRows, eventHistoryByContact] = await Promise.all([
    supabase.from("contact_groups").select("contact_id,group_id").eq("contact_id", contactId),
    supabase.from("contact_references").select("contact_id,reference_id").eq("contact_id", contactId),
    supabase.from("contacts_missing_required_data").select("id,missing_fields").eq("id", contactId),
    loadContactEventHistory(supabase, [contactId]),
  ]);

  for (const result of [contactGroups, contactReferences, missingRows]) {
    if (result.error) throw result.error;
  }

  return buildContactRecord(
    contact as unknown as ContactRecord,
    new Map([[contactId, (contactGroups.data ?? []).map((row) => Number(row.group_id))]]),
    new Map([[contactId, (contactReferences.data ?? []).map((row) => Number(row.reference_id))]]),
    new Map((missingRows.data ?? []).map((row) => [Number(row.id), row.missing_fields ?? []])),
    eventHistoryByContact,
  );
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

  const [
    contactSearchResult,
    groupsResult,
    referencesResult,
    languagesResult,
  ] = await Promise.all([
    supabase.rpc("search_contacts_page", {
      p_search: search,
      p_status: status,
      p_match: matchMode,
      p_priority: hasPriorityFilter ? priority : "all",
      p_group_ids: groupIds,
      p_reference_id: hasReferenceFilter ? referenceId : null,
      p_missing: hasMissingFilter ? missing : "all",
      p_created_from: createdFrom || null,
      p_created_to: createdTo || null,
      p_updated_from: updatedFrom || null,
      p_updated_to: updatedTo || null,
      p_limit: CONTACT_PAGE_SIZE,
      p_offset: from,
    }),
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

  for (const result of [contactSearchResult, groupsResult, referencesResult, languagesResult]) {
    if (result.error) throw result.error;
  }

  const searchRows = (contactSearchResult.data ?? []) as unknown as ContactSearchRow[];
  const contacts = searchRows.map((row) => row.contact);
  const totalContacts = Number(searchRows[0]?.total_count ?? 0);
  const contactIds = contacts.map((contact) => Number(contact.id));
  const openContactFromPage = openContactId
    ? contacts.find((contact) => Number(contact.id) === openContactId) ?? null
    : null;
  const [loadedOpenContact, eventHistoryByContact] = await Promise.all([
    openContactId && !openContactFromPage ? loadContactById(supabase, openContactId) : Promise.resolve(null),
    loadContactEventHistory(supabase, contactIds),
  ]);

  const contactRecords = contacts.map((contact) =>
    ({
      ...contact,
      event_history: eventHistoryByContact.get(Number(contact.id)) ?? [],
    }) as ContactRecord,
  );
  const initialSelectedContact = openContactFromPage
    ? ({
        ...openContactFromPage,
        event_history: eventHistoryByContact.get(Number(openContactFromPage.id)) ?? [],
      } as ContactRecord)
    : loadedOpenContact;
  const selectedReferenceIds = new Set(
    [...contactRecords, ...(initialSelectedContact ? [initialSelectedContact] : [])].flatMap(
      (contact) => contact.reference_ids,
    ),
  );

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
          totalContacts={totalContacts}
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
