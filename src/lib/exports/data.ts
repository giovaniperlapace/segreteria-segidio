import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";
import { CONTACT_COLUMNS } from "@/app/dashboard/contacts/contact-data";
import type { ContactRecord } from "@/app/dashboard/contacts/contact-management";

export type ExportFormat = "pdf" | "xlsx";

export type ContactExportType = "list" | "missing" | "labels";

export type EventExportType =
  | "invitations"
  | "invitations_by_group"
  | "responses"
  | "participants"
  | "followup"
  | "not_invited"
  | "proposals"
  | "labels";

export type ExportOption = { id: number; name: string };

type ContactSearchRow = {
  contact: ContactRecord;
  total_count: number | null;
};

export const CONTACT_STATUS_LABELS: Record<ContactRecord["status"], string> = {
  active: "Attivo",
  standby: "Non attivo",
};

export const CONTACT_PRIORITY_LABELS: Record<ContactRecord["priority"], string> = {
  standard: "Standard",
  important: "Importante",
  critical: "Critica",
};

export const RESPONSE_LABELS = {
  no_response: "Nessuna risposta",
  attending: "Partecipa",
  declined: "Non partecipa",
  maybe: "Forse",
} as const;

export const INVITATION_STATUS_LABELS = {
  pending_approval: "Da approvare",
  draft: "Bozza",
  proposed: "Proposto",
  selected: "Da invitare",
  invited: "Invitato",
  excluded: "Escluso",
} as const;

export const ATTENDANCE_LABELS = {
  unknown: "Non verificata",
  attended: "Presente",
  absent: "Assente",
} as const;

export function paramValue(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key) ?? "";
}

export function parseNumberList(value: string) {
  return [
    ...new Set(
      value
        .split(",")
        .map(Number)
        .filter((item) => Number.isSafeInteger(item) && item > 0),
    ),
  ];
}

export function parseContactExportType(value: string): ContactExportType {
  return value === "missing" || value === "labels" ? value : "list";
}

export function parseEventExportType(value: string): EventExportType {
  const allowed = new Set<EventExportType>([
    "invitations",
    "invitations_by_group",
    "responses",
    "participants",
    "followup",
    "not_invited",
    "proposals",
    "labels",
  ]);
  return allowed.has(value as EventExportType) ? (value as EventExportType) : "invitations";
}

export function parseExportFormat(value: string): ExportFormat {
  return value === "xlsx" ? "xlsx" : "pdf";
}

export function sanitizeSearchTerm(value: string) {
  return value.trim().replace(/[%*,]/g, " ").replace(/\s+/g, " ");
}

export function parseDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

export function contactDisplayName(contact: Pick<ContactRecord, "first_name" | "last_name" | "institution">) {
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.institution || "Contatto senza nome";
}

export function contactSortName(contact: Pick<ContactRecord, "first_name" | "last_name" | "institution">) {
  return [contact.last_name, contact.first_name, contact.institution].filter(Boolean).join(" ");
}

export function optionNames(ids: number[] = [], options: ExportOption[]) {
  const names = new Map(options.map((option) => [option.id, option.name]));
  return ids.map((id) => names.get(id)).filter((name): name is string => Boolean(name));
}

export function presentOrMissing(value: string | null | undefined, missingLabel: string) {
  return value?.trim() ? value.trim() : missingLabel;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "";
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function filterSummary(parts: string[]) {
  const filtered = parts.filter(Boolean);
  return filtered.length > 0 ? filtered.join(" - ") : "Tutti i record disponibili";
}

export async function loadExportOptions(supabase: SupabaseClient) {
  const [groupsResult, referencesResult] = await Promise.all([
    supabase.from("groups").select("id,name").order("name"),
    supabase
      .from("internal_references")
      .select("id,full_name")
      .is("deleted_at", null)
      .order("full_name"),
  ]);
  if (groupsResult.error) throw groupsResult.error;
  if (referencesResult.error) throw referencesResult.error;
  return {
    groups: (groupsResult.data ?? []).map((group) => ({
      id: Number(group.id),
      name: String(group.name),
    })),
    references: (referencesResult.data ?? []).map((reference) => ({
      id: Number(reference.id),
      name: String(reference.full_name),
    })),
  };
}

export async function loadContactsForExport(
  supabase: SupabaseClient,
  searchParams: URLSearchParams,
) {
  const search = sanitizeSearchTerm(paramValue(searchParams, "q"));
  const status = ["active", "standby", "all"].includes(paramValue(searchParams, "status"))
    ? paramValue(searchParams, "status")
    : "active";
  const priority = ["standard", "important", "critical"].includes(paramValue(searchParams, "priority"))
    ? paramValue(searchParams, "priority")
    : "all";
  const groupIds = parseNumberList(paramValue(searchParams, "groups"));
  const referenceIds = parseNumberList(paramValue(searchParams, "references") || paramValue(searchParams, "referenceIds"));
  const missing = ["yes", "no"].includes(paramValue(searchParams, "missing"))
    ? paramValue(searchParams, "missing")
    : "all";
  const matchMode = paramValue(searchParams, "match") === "or" ? "or" : "and";
  const createdFrom = parseDate(paramValue(searchParams, "createdFrom"));
  const createdTo = parseDate(paramValue(searchParams, "createdTo"));
  const updatedFrom = parseDate(paramValue(searchParams, "updatedFrom"));
  const updatedTo = parseDate(paramValue(searchParams, "updatedTo"));
  const rows: ContactRecord[] = [];

  for (let offset = 0; ; offset += 200) {
    const { data, error } = await supabase.rpc("search_contacts_page", {
      p_search: search,
      p_status: status,
      p_match: matchMode,
      p_priority: priority,
      p_group_ids: groupIds,
      p_reference_ids: referenceIds,
      p_missing: missing,
      p_created_from: createdFrom || null,
      p_created_to: createdTo || null,
      p_updated_from: updatedFrom || null,
      p_updated_to: updatedTo || null,
      p_limit: 200,
      p_offset: offset,
    });
    if (error) throw error;
    const pageRows = (data ?? []) as unknown as ContactSearchRow[];
    rows.push(...pageRows.map((row) => row.contact));
    if (pageRows.length < 200) break;
  }

  return {
    contacts: rows,
    filters: { search, status, priority, groupIds, referenceIds, missing, matchMode, createdFrom, createdTo, updatedFrom, updatedTo },
  };
}

export type EventInvitationExportRow = {
  rowType: "invitation" | "proposal";
  invitationId: number | null;
  proposalIds: number[];
  contact: ContactRecord;
  contactId: number;
  contactName: string;
  contactDetail: string;
  contactEmail: string | null;
  invitationStatus: keyof typeof INVITATION_STATUS_LABELS;
  responseStatus: keyof typeof RESPONSE_LABELS;
  attendanceStatus: keyof typeof ATTENDANCE_LABELS;
  attentionFlag: boolean;
  attentionNote: string | null;
  notes: string | null;
  responseNote: string | null;
  companionCount: number;
  companionNames: string | null;
  invitedAt: string | null;
  responseRecordedAt: string | null;
  responseRecordedByName: string | null;
  approvalReferences: string[];
};

export async function loadEventForExport(supabase: SupabaseClient, eventId: number, search = "") {
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id,title,starts_at,location,status,legacy_access_id")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) throw eventError;
  if (!event) return null;

  let invitationsQuery = supabase
    .from("event_invitations")
    .select(
      `id,event_id,contact_id,invitation_status,response_status,attendance_status,attention_flag,attention_note,notes,response_note,companion_count,companion_names,invited_at,response_recorded_at,response_recorded_by_profile_id,contacts!inner(${CONTACT_COLUMNS})`,
    )
    .eq("event_id", eventId);
  const sanitizedSearch = sanitizeSearchTerm(search);
  if (sanitizedSearch) {
    const pattern = `%${sanitizedSearch}%`;
    invitationsQuery = invitationsQuery.or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},institution.ilike.${pattern},institutional_role.ilike.${pattern},email.ilike.${pattern}`,
      { foreignTable: "contacts" },
    );
  }

  const [invitations, proposalsResult, options] = await Promise.all([
    fetchAllSupabaseRows(() =>
      invitationsQuery
        .order("last_name", { foreignTable: "contacts", ascending: true, nullsFirst: false })
        .order("first_name", { foreignTable: "contacts", ascending: true, nullsFirst: false }),
    ),
    supabase
      .from("invitation_proposals")
      .select(
        `id,event_id,contact_id,reference_id,status,manager_note,contacts!inner(${CONTACT_COLUMNS}),internal_references!inner(id,full_name)`,
      )
      .eq("event_id", eventId)
      .eq("status", "pending"),
    loadExportOptions(supabase),
  ]);
  if (proposalsResult.error) throw proposalsResult.error;

  const profileIds = [
    ...new Set(
      invitations
        .map((invitation) => invitation.response_recorded_by_profile_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const profilesResult =
    profileIds.length > 0
      ? await supabase.from("profiles").select("id,full_name,email").in("id", profileIds)
      : { data: [], error: null };
  if (profilesResult.error) throw profilesResult.error;
  const profileNames = new Map(
    (profilesResult.data ?? []).map((profile) => [
      profile.id,
      profile.full_name || profile.email || "Utente senza nome",
    ]),
  );

  const proposalContactIds = new Set((proposalsResult.data ?? []).map((proposal) => Number(proposal.contact_id)));
  const invitationContactIds = invitations.map((invitation) => Number(invitation.contact_id));
  const allContactIds = [
    ...new Set([
      ...invitationContactIds,
      ...(proposalsResult.data ?? []).map((proposal) => Number(proposal.contact_id)),
    ]),
  ];
  const [contactGroups, contactReferences, missingRows] =
    allContactIds.length > 0
      ? await Promise.all([
          fetchAllSupabaseRows(() =>
            supabase.from("contact_groups").select("contact_id,group_id").in("contact_id", allContactIds),
          ),
          fetchAllSupabaseRows(() =>
            supabase.from("contact_references").select("contact_id,reference_id").in("contact_id", allContactIds),
          ),
          fetchAllSupabaseRows(() =>
            supabase.from("contacts_missing_required_data").select("id,missing_fields").in("id", allContactIds),
          ),
        ])
      : [[], [], []];

  const groupIdsByContact = new Map<number, number[]>();
  for (const row of contactGroups) {
    const contactId = Number(row.contact_id);
    groupIdsByContact.set(contactId, [...(groupIdsByContact.get(contactId) ?? []), Number(row.group_id)]);
  }
  const referenceIdsByContact = new Map<number, number[]>();
  for (const row of contactReferences) {
    const contactId = Number(row.contact_id);
    referenceIdsByContact.set(contactId, [...(referenceIdsByContact.get(contactId) ?? []), Number(row.reference_id)]);
  }
  const missingByContact = new Map(missingRows.map((row) => [Number(row.id), row.missing_fields ?? []]));

  function decorateContact(contact: ContactRecord) {
    const contactId = Number(contact.id);
    return {
      ...contact,
      group_ids: groupIdsByContact.get(contactId) ?? [],
      reference_ids: referenceIdsByContact.get(contactId) ?? [],
      missing_fields: missingByContact.get(contactId) ?? [],
      event_history: [],
    } as ContactRecord;
  }

  const invitationRows = invitations.map((invitation) => {
    const contact = Array.isArray(invitation.contacts) ? invitation.contacts[0] : invitation.contacts;
    const decoratedContact = decorateContact(contact as ContactRecord);
    return {
      rowType: "invitation",
      invitationId: Number(invitation.id),
      proposalIds: [],
      contact: decoratedContact,
      contactId: Number(invitation.contact_id),
      contactName: contactDisplayName(decoratedContact),
      contactDetail: [decoratedContact.institutional_role, decoratedContact.institution].filter(Boolean).join(" - "),
      contactEmail: decoratedContact.email ?? decoratedContact.email_2 ?? null,
      invitationStatus: invitation.invitation_status,
      responseStatus: invitation.response_status,
      attendanceStatus: invitation.attendance_status,
      attentionFlag: Boolean(invitation.attention_flag),
      attentionNote: invitation.attention_note,
      notes: invitation.notes,
      responseNote: invitation.response_note,
      companionCount: Number(invitation.companion_count ?? 0),
      companionNames: invitation.companion_names,
      invitedAt: invitation.invited_at,
      responseRecordedAt: invitation.response_recorded_at,
      responseRecordedByName: invitation.response_recorded_by_profile_id
        ? profileNames.get(invitation.response_recorded_by_profile_id) ?? "Utente non disponibile"
        : null,
      approvalReferences: [],
    } satisfies EventInvitationExportRow;
  });

  const invitedContactIds = new Set(invitationRows.map((row) => row.contactId));
  const proposalsByContact = new Map<number, { ids: number[]; references: string[]; note: string | null; contact: ContactRecord }>();
  for (const proposal of proposalsResult.data ?? []) {
    const contactId = Number(proposal.contact_id);
    if (invitedContactIds.has(contactId)) continue;
    const contact = Array.isArray(proposal.contacts) ? proposal.contacts[0] : proposal.contacts;
    const reference = Array.isArray(proposal.internal_references)
      ? proposal.internal_references[0]
      : proposal.internal_references;
    const current = proposalsByContact.get(contactId) ?? ({
      ids: [],
      references: [],
      note: proposal.manager_note,
      contact: decorateContact(contact as ContactRecord),
    } as { ids: number[]; references: string[]; note: string | null; contact: ContactRecord });
    current.ids.push(Number(proposal.id));
    if (reference?.full_name) current.references.push(String(reference.full_name));
    proposalsByContact.set(contactId, current);
  }
  const proposalRows = [...proposalsByContact.entries()].map(([contactId, proposal]) => ({
    rowType: "proposal",
    invitationId: null,
    proposalIds: proposal.ids,
    contact: proposal.contact,
    contactId,
    contactName: contactDisplayName(proposal.contact),
    contactDetail: [proposal.contact.institutional_role, proposal.contact.institution].filter(Boolean).join(" - "),
    contactEmail: proposal.contact.email ?? proposal.contact.email_2 ?? null,
    invitationStatus: "pending_approval",
    responseStatus: "no_response",
    attendanceStatus: "unknown",
    attentionFlag: false,
    attentionNote: null,
    notes: proposal.note,
    responseNote: null,
    companionCount: 0,
    companionNames: null,
    invitedAt: null,
    responseRecordedAt: null,
    responseRecordedByName: null,
    approvalReferences: [...new Set(proposal.references)].sort((a, b) => a.localeCompare(b, "it")),
  })) satisfies EventInvitationExportRow[];

  return {
    event,
    rows: [...invitationRows, ...proposalRows].sort((a, b) => contactSortName(a.contact).localeCompare(contactSortName(b.contact), "it")),
    invitedContactIds: new Set([...invitedContactIds, ...proposalContactIds]),
    options,
  };
}

export async function loadNotInvitedContactsForEvent(supabase: SupabaseClient, eventId: number) {
  const [contacts, invitationRows, proposalRows, options] = await Promise.all([
    fetchAllSupabaseRows(() =>
      supabase
        .from("contacts")
        .select(CONTACT_COLUMNS)
        .is("deleted_at", null)
        .eq("status", "active")
        .order("last_name")
        .order("first_name"),
    ),
    fetchAllSupabaseRows(() => supabase.from("event_invitations").select("contact_id").eq("event_id", eventId)),
    fetchAllSupabaseRows(() => supabase.from("invitation_proposals").select("contact_id").eq("event_id", eventId).eq("status", "pending")),
    loadExportOptions(supabase),
  ]);
  const excludedIds = new Set([
    ...invitationRows.map((row) => Number(row.contact_id)),
    ...proposalRows.map((row) => Number(row.contact_id)),
  ]);
  const availableContacts = (contacts as ContactRecord[]).filter((contact) => !excludedIds.has(Number(contact.id)));
  const contactIds = availableContacts.map((contact) => Number(contact.id));
  const [contactGroups, contactReferences, missingRows] =
    contactIds.length > 0
      ? await Promise.all([
          fetchAllSupabaseRows(() => supabase.from("contact_groups").select("contact_id,group_id").in("contact_id", contactIds)),
          fetchAllSupabaseRows(() => supabase.from("contact_references").select("contact_id,reference_id").in("contact_id", contactIds)),
          fetchAllSupabaseRows(() => supabase.from("contacts_missing_required_data").select("id,missing_fields").in("id", contactIds)),
        ])
      : [[], [], []];
  const groupIdsByContact = new Map<number, number[]>();
  for (const row of contactGroups) {
    const contactId = Number(row.contact_id);
    groupIdsByContact.set(contactId, [...(groupIdsByContact.get(contactId) ?? []), Number(row.group_id)]);
  }
  const referenceIdsByContact = new Map<number, number[]>();
  for (const row of contactReferences) {
    const contactId = Number(row.contact_id);
    referenceIdsByContact.set(contactId, [...(referenceIdsByContact.get(contactId) ?? []), Number(row.reference_id)]);
  }
  const missingByContact = new Map(missingRows.map((row) => [Number(row.id), row.missing_fields ?? []]));
  return {
    contacts: availableContacts.map((contact) => ({
      ...contact,
      group_ids: groupIdsByContact.get(Number(contact.id)) ?? [],
      reference_ids: referenceIdsByContact.get(Number(contact.id)) ?? [],
      missing_fields: missingByContact.get(Number(contact.id)) ?? [],
      event_history: [],
    })) as ContactRecord[],
    options,
  };
}
