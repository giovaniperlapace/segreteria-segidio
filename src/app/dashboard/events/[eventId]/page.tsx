import Link from "next/link";
import { notFound } from "next/navigation";
import { requireManager } from "@/lib/auth/profile";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { CONTACT_COLUMNS } from "../../contacts/contact-data";
import type { ContactRecord } from "../../contacts/contact-management";
import { InvitationManagement, type EventInvitationRecord } from "./invitation-management";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 80;

type EventDetailSearchParams = Record<string, string | string[] | undefined>;

function paramValue(searchParams: EventDetailSearchParams, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function parsePositiveInt(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeSearchTerm(value: string) {
  return value.trim().replace(/[%*,]/g, " ").replace(/\s+/g, " ");
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
}

function contactName(contact: {
  first_name?: string | null;
  last_name?: string | null;
  institution?: string | null;
}) {
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.institution || "Contatto senza nome";
}

function pageHref(eventId: number, page: number, q: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/dashboard/events/${eventId}${query ? `?${query}` : ""}`;
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams?: Promise<EventDetailSearchParams>;
}) {
  await requireManager();
  const { eventId: eventIdParam } = await params;
  const eventId = parsePositiveInt(eventIdParam, 0);
  if (!eventId) notFound();

  const resolvedSearchParams = (await searchParams) ?? {};
  const page = parsePositiveInt(paramValue(resolvedSearchParams, "page"), 1);
  const search = sanitizeSearchTerm(paramValue(resolvedSearchParams, "q"));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const supabase = createSupabaseServiceClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id,title,description,starts_at,ends_at,location,status,legacy_access_id")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) throw eventError;
  if (!event) notFound();

  let invitationsQuery = supabase
    .from("event_invitations")
    .select(
      `id,event_id,contact_id,invitation_status,response_status,attendance_status,attention_flag,attention_note,notes,response_note,companion_count,companion_names,invited_at,response_recorded_at,response_recorded_by_profile_id,invitation_status_updated_at,invitation_status_updated_by_profile_id,legacy_invited_raw,legacy_viene_raw,legacy_presence_raw,contacts!inner(${CONTACT_COLUMNS})`,
      { count: "exact" },
    )
    .eq("event_id", eventId);

  if (search) {
    const pattern = `%${search}%`;
    invitationsQuery = invitationsQuery.or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},institution.ilike.${pattern},institutional_role.ilike.${pattern},email.ilike.${pattern}`,
      { foreignTable: "contacts" },
    );
  }

  const [
    { data: invitations, error: invitationsError, count },
    proposalsResult,
    { data: contacts, error: contactsError },
    groupsResult,
    referencesResult,
    languagesResult,
    responseCountsResult,
  ] =
    await Promise.all([
      invitationsQuery
        .order("attention_flag", { ascending: false })
        .order("last_name", { foreignTable: "contacts", ascending: true, nullsFirst: false })
        .order("first_name", { foreignTable: "contacts", ascending: true, nullsFirst: false })
        .range(from, to),
      supabase
        .from("invitation_proposals")
        .select(
          `id,event_id,contact_id,reference_id,status,manager_note,contacts!inner(${CONTACT_COLUMNS}),internal_references!inner(id,full_name)`,
        )
        .eq("event_id", eventId)
        .eq("status", "pending"),
      supabase
        .from("contacts")
        .select("id,first_name,last_name,institution,institutional_role,email,status")
        .is("deleted_at", null)
        .eq("status", "active")
        .order("last_name")
        .order("first_name")
        .limit(800),
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
      supabase.rpc("event_invitation_response_counts", { p_event_id: eventId }).maybeSingle(),
    ]);

  if (invitationsError) throw invitationsError;
  if (proposalsResult.error) throw proposalsResult.error;
  if (contactsError) throw contactsError;
  for (const result of [groupsResult, referencesResult, languagesResult]) {
    if (result.error) throw result.error;
  }
  if (responseCountsResult.error) throw responseCountsResult.error;

  const invitationProfileIds = [
    ...new Set(
      (invitations ?? [])
        .flatMap((invitation) => [
          invitation.invitation_status_updated_by_profile_id,
          invitation.response_recorded_by_profile_id,
        ])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: invitationProfiles, error: invitationProfilesError } =
    invitationProfileIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id,full_name,email")
          .in("id", invitationProfileIds)
      : { data: [], error: null };
  if (invitationProfilesError) throw invitationProfilesError;
  const invitationProfilesById = new Map(
    (invitationProfiles ?? []).map((profile) => [
      profile.id,
      profile.full_name || profile.email || "Utente senza nome",
    ]),
  );

  const proposalContactIds = new Set(
    (proposalsResult.data ?? []).map((proposal) => Number(proposal.contact_id)),
  );
  const invitedIdsFromQuery = new Set((invitations ?? []).map((invitation) => Number(invitation.contact_id)));
  const visibleProposals = (proposalsResult.data ?? []).filter(
    (proposal) => !invitedIdsFromQuery.has(Number(proposal.contact_id)),
  );
  const invitationContacts = [
    ...(invitations ?? []).map((invitation) =>
      Array.isArray(invitation.contacts) ? invitation.contacts[0] : invitation.contacts,
    ),
    ...visibleProposals.map((proposal) =>
      Array.isArray(proposal.contacts) ? proposal.contacts[0] : proposal.contacts,
    ),
  ]
    .filter(Boolean) as unknown as ContactRecord[];
  const invitationContactIds = [...new Set(invitationContacts.map((contact) => Number(contact.id)))];
  const [contactGroups, contactReferences, missingRows, eventInvitationRows] =
    invitationContactIds.length > 0
      ? await Promise.all([
          fetchAllSupabaseRows(() =>
            supabase
              .from("contact_groups")
              .select("contact_id,group_id")
              .in("contact_id", invitationContactIds),
          ),
          fetchAllSupabaseRows(() =>
            supabase
              .from("contact_references")
              .select("contact_id,reference_id")
              .in("contact_id", invitationContactIds),
          ),
          fetchAllSupabaseRows(() =>
            supabase
              .from("contacts_missing_required_data")
              .select("id,missing_fields")
              .in("id", invitationContactIds),
          ),
          fetchAllSupabaseRows(() =>
            supabase
              .from("event_invitations")
              .select("contact_id,response_status,attendance_status,events!inner(id,title,starts_at)")
              .in("contact_id", invitationContactIds),
          ),
        ])
      : [[], [], [], []];

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
  const eventHistoryByContact = new Map<number, ContactRecord["event_history"]>();
  for (const row of eventInvitationRows) {
    const contactId = Number(row.contact_id);
    const historyEvent = Array.isArray(row.events) ? row.events[0] : row.events;
    if (!historyEvent) continue;
    eventHistoryByContact.set(contactId, [
      ...(eventHistoryByContact.get(contactId) ?? []),
      {
        event_id: Number(historyEvent.id),
        title: String(historyEvent.title),
        starts_at: String(historyEvent.starts_at),
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
  const contactRecordsById = new Map<number, ContactRecord>();
  for (const contact of invitationContacts) {
    const contactId = Number(contact.id);
    contactRecordsById.set(contactId, {
      ...contact,
      group_ids: groupIdsByContact.get(contactId) ?? [],
      reference_ids: referenceIdsByContact.get(contactId) ?? [],
      missing_fields: missingByContact.get(contactId) ?? [],
      event_history: eventHistoryByContact.get(contactId) ?? [],
    });
  }

  const invitationRows = (invitations ?? []).map((invitation) => {
    const contact = Array.isArray(invitation.contacts) ? invitation.contacts[0] : invitation.contacts;
    const contactRecord = contactRecordsById.get(Number(invitation.contact_id));
    if (!contactRecord) {
      throw new Error(`Contatto ${invitation.contact_id} non disponibile per l'invito ${invitation.id}.`);
    }
    return {
      id: Number(invitation.id),
      event_id: Number(invitation.event_id),
      contact_id: Number(invitation.contact_id),
      row_type: "invitation",
      invitation_status: invitation.invitation_status,
      response_status: invitation.response_status,
      attendance_status: invitation.attendance_status,
      attention_flag: Boolean(invitation.attention_flag),
      attention_note: invitation.attention_note,
      notes: invitation.notes,
      response_note: invitation.response_note,
      companion_count: Number(invitation.companion_count ?? 0),
      companion_names: invitation.companion_names,
      invited_at: invitation.invited_at,
      response_recorded_at: invitation.response_recorded_at,
      response_recorded_by_profile_id: invitation.response_recorded_by_profile_id,
      response_recorded_by_name: invitation.response_recorded_by_profile_id
        ? invitationProfilesById.get(invitation.response_recorded_by_profile_id) ?? "Utente non disponibile"
        : null,
      invitation_status_updated_at: invitation.invitation_status_updated_at,
      invitation_status_updated_by_profile_id: invitation.invitation_status_updated_by_profile_id,
      invitation_status_updated_by_name: invitation.invitation_status_updated_by_profile_id
        ? invitationProfilesById.get(invitation.invitation_status_updated_by_profile_id) ?? "Utente non disponibile"
        : null,
      legacy_invited_raw: invitation.legacy_invited_raw,
      legacy_viene_raw: invitation.legacy_viene_raw,
      legacy_presence_raw: invitation.legacy_presence_raw,
      contact_name: contactName(contact ?? {}),
      contact_detail: [contact?.institutional_role, contact?.institution].filter(Boolean).join(" · "),
      contact_email: contact?.email ?? contact?.email_2 ?? null,
      approval_references: [],
      proposal_ids: [],
      contact: contactRecord,
    };
  }) as EventInvitationRecord[];

  const proposalsByContact = new Map<
    number,
    { ids: number[]; references: string[]; note: string | null }
  >();
  for (const proposal of visibleProposals) {
    const contactId = Number(proposal.contact_id);
    const reference = Array.isArray(proposal.internal_references)
      ? proposal.internal_references[0]
      : proposal.internal_references;
    const current = proposalsByContact.get(contactId) ?? { ids: [], references: [], note: null };
    current.ids.push(Number(proposal.id));
    if (reference?.full_name) current.references.push(String(reference.full_name));
    current.note = current.note ?? proposal.manager_note;
    proposalsByContact.set(contactId, current);
  }
  const proposalRows = [...proposalsByContact.entries()].map(([contactId, proposal]) => {
    const contact = contactRecordsById.get(contactId);
    if (!contact) throw new Error(`Contatto ${contactId} non disponibile per la proposta.`);
    return {
      id: -proposal.ids[0],
      event_id: eventId,
      contact_id: contactId,
      row_type: "proposal",
      invitation_status: "pending_approval",
      response_status: "no_response",
      attendance_status: "unknown",
      attention_flag: false,
      attention_note: null,
      notes: proposal.note,
      response_note: null,
      companion_count: 0,
      companion_names: null,
      invited_at: null,
      response_recorded_at: null,
      response_recorded_by_profile_id: null,
      response_recorded_by_name: null,
      invitation_status_updated_at: null,
      invitation_status_updated_by_profile_id: null,
      invitation_status_updated_by_name: null,
      legacy_invited_raw: null,
      legacy_viene_raw: null,
      legacy_presence_raw: null,
      contact_name: contactName(contact),
      contact_detail: [contact.institutional_role, contact.institution].filter(Boolean).join(" · "),
      contact_email: contact.email ?? contact.email_2 ?? null,
      approval_references: [...new Set(proposal.references)].sort((a, b) => a.localeCompare(b, "it")),
      proposal_ids: proposal.ids,
      contact,
    };
  }) as EventInvitationRecord[];
  const eventRows = [...invitationRows, ...proposalRows].sort((a, b) =>
    a.contact_name.localeCompare(b.contact_name, "it", { sensitivity: "base" }),
  );

  const invitedContactIds = new Set([
    ...invitationRows.map((invitation) => invitation.contact_id),
    ...proposalContactIds,
  ]);
  const contactOptions = (contacts ?? [])
    .filter(
      (contact) =>
        contact.status === "active" &&
        !invitedContactIds.has(Number(contact.id)),
    )
    .map((contact) => ({
      id: Number(contact.id),
      name: contactName(contact),
      detail: [contact.institutional_role, contact.institution, contact.email].filter(Boolean).join(" · "),
    }));

  const total = (count ?? invitationRows.length) + proposalRows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const responseCounts = (responseCountsResult.data ?? {
    total_count: 0,
    selected_count: 0,
    invited_count: 0,
    no_response_count: 0,
    attending_count: 0,
    declined_count: 0,
    maybe_count: 0,
  }) as {
    total_count: number;
    selected_count: number;
    invited_count: number;
    no_response_count: number;
    attending_count: number;
    declined_count: number;
    maybe_count: number;
  };

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <div className="flex flex-wrap gap-3 text-sm font-semibold text-[#d43c2f]">
            <Link href="/dashboard" className="hover:underline">← Dashboard</Link>
            <Link href="/dashboard/events" className="hover:underline">← Eventi</Link>
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-[#1b3272]">{event.title}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {formatDateTime(event.starts_at)}
            {event.location ? ` · ${event.location}` : ""}
            {event.legacy_access_id ? ` · Access #${event.legacy_access_id}` : ""}
          </p>
          <p className="mt-3 text-sm text-slate-600">
            {eventRows.length} contatti mostrati di {total} nella lista evento.
          </p>
        </header>

        <InvitationManagement
          eventId={eventId}
          pageSearch={search}
          invitations={eventRows}
          summary={{
            total: Number(responseCounts.total_count) + proposalsByContact.size,
            pendingApproval: proposalsByContact.size,
            selected: Number(responseCounts.selected_count),
            invited: Number(responseCounts.invited_count),
            noResponse: Number(responseCounts.no_response_count),
            attending: Number(responseCounts.attending_count),
            declined: Number(responseCounts.declined_count),
            maybe: Number(responseCounts.maybe_count),
          }}
          contactOptions={contactOptions}
          groups={(groupsResult.data ?? []).map((group) => ({
            id: Number(group.id),
            name: String(group.name),
            active: Boolean(group.active),
          }))}
          references={(referencesResult.data ?? []).map((reference) => ({
            id: Number(reference.id),
            name: String(reference.full_name),
            active: Boolean(reference.active),
          }))}
          languages={(languagesResult.data ?? []).map((language) => ({
            id: Number(language.id),
            name: String(language.name),
            active: Boolean(language.active),
          }))}
        />

        {totalPages > 1 ? (
          <nav className="mt-8 flex flex-wrap items-center justify-between gap-3 text-sm">
            <Link
              href={pageHref(eventId, Math.max(1, page - 1), search)}
              className={`rounded-xl border border-[#d9e1f2] bg-white px-3 py-2 font-semibold text-[#1b3272] ${page <= 1 ? "pointer-events-none opacity-40" : "hover:border-[#d43c2f]"}`}
            >
              Precedente
            </Link>
            <span className="text-slate-600">Pagina {page} di {totalPages}</span>
            <Link
              href={pageHref(eventId, Math.min(totalPages, page + 1), search)}
              className={`rounded-xl border border-[#d9e1f2] bg-white px-3 py-2 font-semibold text-[#1b3272] ${page >= totalPages ? "pointer-events-none opacity-40" : "hover:border-[#d43c2f]"}`}
            >
              Successiva
            </Link>
          </nav>
        ) : null}
      </div>
    </main>
  );
}
