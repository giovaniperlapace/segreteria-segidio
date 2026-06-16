import type { ContactRecord } from "@/app/dashboard/contacts/contact-management";
import type { ExportColumn, ExportTable } from "./renderers";
import {
  CONTACT_PRIORITY_LABELS,
  CONTACT_STATUS_LABELS,
  type ContactExportType,
  type EventExportType,
  type EventInvitationExportRow,
  type ExportOption,
  filterSummary,
  formatDateTime,
  optionNames,
  presentOrMissing,
  RESPONSE_LABELS,
  INVITATION_STATUS_LABELS,
} from "./data";

type ContactFilters = {
  search: string;
  status: string;
  priority: string;
  groupIds: number[];
  referenceIds: number[];
  missing: string;
  matchMode: string;
  createdFrom: string;
  createdTo: string;
  updatedFrom: string;
  updatedTo: string;
};

function fullName(contact: ContactRecord) {
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.institution || "Contatto senza nome";
}

function groups(contact: ContactRecord, options: ExportOption[]) {
  return optionNames(contact.group_ids, options).join(", ");
}

function references(contact: ContactRecord, options: ExportOption[]) {
  return optionNames(contact.reference_ids, options).join(", ");
}

function missingFields(contact: ContactRecord) {
  return contact.missing_fields.length > 0 ? contact.missing_fields.join(", ") : "Completi";
}

function baseContactColumns(options: { groups: ExportOption[]; references: ExportOption[] }): ExportColumn<ContactRecord>[] {
  return [
    { key: "name", header: "Nome", width: 24, value: fullName },
    { key: "role", header: "Carica", width: 30, value: (contact) => contact.institutional_role },
    { key: "institution", header: "Istituzione", width: 32, value: (contact) => contact.institution },
    { key: "groups", header: "Gruppi", width: 26, value: (contact) => groups(contact, options.groups) },
    { key: "references", header: "Referenti", width: 26, value: (contact) => references(contact, options.references) },
    { key: "email", header: "Email", width: 28, value: (contact) => presentOrMissing(contact.email ?? contact.email_2, "Email mancante") },
    { key: "phone", header: "Telefono", width: 20, value: (contact) => presentOrMissing(contact.phone ?? contact.mobile_phone ?? contact.phone_home, "Telefono mancante") },
    { key: "country", header: "Paese", width: 18, value: (contact) => contact.country },
    { key: "language", header: "Lingua", width: 16, value: (contact) => contact.spoken_language },
    { key: "priority", header: "Priorita'", width: 14, value: (contact) => CONTACT_PRIORITY_LABELS[contact.priority] },
    { key: "status", header: "Stato", width: 14, value: (contact) => CONTACT_STATUS_LABELS[contact.status] },
  ];
}

export function contactExportTitle(type: ContactExportType) {
  if (type === "missing") return "Contatti con dati mancanti";
  if (type === "labels") return "Etichette contatti";
  return "Lista contatti";
}

export function buildContactsTable(
  contacts: ContactRecord[],
  type: ContactExportType,
  options: { groups: ExportOption[]; references: ExportOption[] },
  filters: ContactFilters,
): ExportTable<ContactRecord> {
  const rows = type === "missing" ? contacts.filter((contact) => contact.missing_fields.length > 0) : contacts;
  const columns =
    type === "missing"
      ? [
          { key: "name", header: "Nome", width: 24, value: fullName },
          { key: "role", header: "Carica", width: 30, value: (contact: ContactRecord) => contact.institutional_role },
          { key: "institution", header: "Istituzione", width: 32, value: (contact: ContactRecord) => contact.institution },
          { key: "missing", header: "Dati mancanti", width: 30, value: missingFields },
          { key: "groups", header: "Gruppi", width: 26, value: (contact: ContactRecord) => groups(contact, options.groups) },
          { key: "references", header: "Referenti", width: 26, value: (contact: ContactRecord) => references(contact, options.references) },
          { key: "notes", header: "Note dati mancanti", width: 32, value: (contact: ContactRecord) => contact.missing_data_notes },
        ]
      : baseContactColumns(options);

  return {
    title: contactExportTitle(type),
    subtitle: filterSummary([
      filters.search ? `Ricerca: ${filters.search}` : "",
      filters.status !== "active" ? `Stato: ${filters.status}` : "Stato: attivi",
      filters.priority !== "all" ? `Priorita': ${filters.priority}` : "",
      filters.groupIds.length > 0 ? `Gruppi: ${optionNames(filters.groupIds, options.groups).join(", ")}` : "",
      filters.referenceIds.length > 0 ? `Referenti: ${optionNames(filters.referenceIds, options.references).join(", ")}` : "",
      filters.missing !== "all" ? `Dati: ${filters.missing === "yes" ? "mancanti" : "completi"}` : "",
      filters.matchMode === "or" ? "Logica: OR" : "",
      filters.createdFrom ? `Creato dal ${filters.createdFrom}` : "",
      filters.createdTo ? `Creato al ${filters.createdTo}` : "",
      filters.updatedFrom ? `Modificato dal ${filters.updatedFrom}` : "",
      filters.updatedTo ? `Modificato al ${filters.updatedTo}` : "",
      `${rows.length} record`,
    ]),
    columns,
    rows,
  };
}

function participantTotal(row: EventInvitationExportRow) {
  return row.responseStatus === "attending" ? 1 + row.companionCount : 0;
}

function invitationBaseColumns(options: { groups: ExportOption[]; references: ExportOption[] }): ExportColumn<EventInvitationExportRow>[] {
  return [
    { key: "name", header: "Nome", width: 24, value: (row) => row.contactName },
    { key: "role", header: "Carica", width: 30, value: (row) => row.contact.institutional_role },
    { key: "institution", header: "Istituzione", width: 32, value: (row) => row.contact.institution },
    { key: "groups", header: "Gruppi", width: 24, value: (row) => groups(row.contact, options.groups) },
    { key: "references", header: "Referenti", width: 24, value: (row) => references(row.contact, options.references) },
    { key: "status", header: "Stato invito", width: 16, value: (row) => INVITATION_STATUS_LABELS[row.invitationStatus] },
    { key: "response", header: "Risposta", width: 18, value: (row) => row.invitationStatus === "invited" ? RESPONSE_LABELS[row.responseStatus] : "N/A" },
    { key: "companions", header: "Accompagnatori", width: 18, value: (row) => row.companionCount || "" },
    { key: "total", header: "Totale partecipanti", width: 14, value: participantTotal },
    { key: "flag", header: "Da seguire", width: 18, value: (row) => row.attentionFlag ? row.attentionNote || "Si" : "No" },
    { key: "note", header: "Note risposta", width: 30, value: (row) => row.responseNote },
  ];
}

export function eventExportTitle(type: EventExportType) {
  const titles: Record<EventExportType, string> = {
    invitations: "Lista invitati evento",
    invitations_by_group: "Lista invitati evento per gruppo",
    responses: "Lista risposte evento",
    participants: "Lista partecipanti evento",
    followup: "Lista da ricontattare",
    not_invited: "Lista non ancora invitati",
    proposals: "Proposte invito evento",
    labels: "Etichette invitati evento",
  };
  return titles[type];
}

export function buildEventTable(
  eventTitle: string,
  rows: EventInvitationExportRow[],
  type: EventExportType,
  options: { groups: ExportOption[]; references: ExportOption[] },
  search = "",
): ExportTable<EventInvitationExportRow> {
  let filteredRows = rows;
  if (type === "responses") {
    filteredRows = rows.filter((row) => row.rowType === "invitation" && row.invitationStatus === "invited");
  } else if (type === "participants") {
    filteredRows = rows.filter((row) => row.rowType === "invitation" && row.responseStatus === "attending");
  } else if (type === "followup") {
    filteredRows = rows.filter(
      (row) =>
        row.rowType === "invitation" &&
        row.invitationStatus === "invited" &&
        (row.responseStatus === "no_response" || row.responseStatus === "maybe"),
    );
  } else if (type === "proposals") {
    filteredRows = rows.filter((row) => row.rowType === "proposal");
  }

  if (type === "invitations_by_group") {
    filteredRows = [...filteredRows].sort((a, b) => {
      const aGroup = groups(a.contact, options.groups);
      const bGroup = groups(b.contact, options.groups);
      return aGroup.localeCompare(bGroup, "it") || a.contactName.localeCompare(b.contactName, "it");
    });
  }

  let columns = invitationBaseColumns(options);
  if (type === "responses") {
    columns = [
      { key: "name", header: "Nome", width: 24, value: (row) => row.contactName },
      { key: "detail", header: "Carica / istituzione", width: 36, value: (row) => row.contactDetail },
      { key: "response", header: "Risposta", width: 18, value: (row) => RESPONSE_LABELS[row.responseStatus] },
      { key: "companions", header: "Accompagnatori", width: 18, value: (row) => row.companionNames || row.companionCount || "" },
      { key: "total", header: "Totale", width: 12, value: participantTotal },
      { key: "date", header: "Data risposta", width: 20, value: (row) => formatDateTime(row.responseRecordedAt) },
      { key: "author", header: "Autore", width: 22, value: (row) => row.responseRecordedByName },
      { key: "note", header: "Note", width: 30, value: (row) => row.responseNote },
      { key: "contact", header: "Ricontatto", width: 28, value: (row) => row.contact.phone ?? row.contact.mobile_phone ?? row.contactEmail },
    ];
  } else if (type === "participants") {
    columns = [
      { key: "name", header: "Nome", width: 24, value: (row) => row.contactName },
      { key: "role", header: "Carica", width: 30, value: (row) => row.contact.institutional_role },
      { key: "institution", header: "Istituzione", width: 32, value: (row) => row.contact.institution },
      { key: "companions", header: "Accompagnatori", width: 26, value: (row) => row.companionNames || row.companionCount || "" },
      { key: "total", header: "Totale persone", width: 14, value: participantTotal },
      { key: "note", header: "Note risposta", width: 30, value: (row) => row.responseNote },
      { key: "flag", header: "Da seguire", width: 18, value: (row) => row.attentionFlag ? row.attentionNote || "Si" : "No" },
    ];
  } else if (type === "followup") {
    columns = [
      { key: "name", header: "Nome", width: 24, value: (row) => row.contactName },
      { key: "detail", header: "Carica / istituzione", width: 36, value: (row) => row.contactDetail },
      { key: "email", header: "Email", width: 28, value: (row) => row.contactEmail },
      { key: "phone", header: "Telefono", width: 22, value: (row) => row.contact.phone ?? row.contact.mobile_phone ?? row.contact.phone_home },
      { key: "references", header: "Referenti", width: 26, value: (row) => references(row.contact, options.references) },
      { key: "response", header: "Risposta", width: 18, value: (row) => RESPONSE_LABELS[row.responseStatus] },
      { key: "note", header: "Note", width: 30, value: (row) => row.responseNote ?? row.notes },
    ];
  } else if (type === "proposals") {
    columns = [
      { key: "name", header: "Nome", width: 24, value: (row) => row.contactName },
      { key: "detail", header: "Carica / istituzione", width: 38, value: (row) => row.contactDetail },
      { key: "references", header: "Referente proponente", width: 30, value: (row) => row.approvalReferences.join(", ") },
      { key: "status", header: "Stato proposta", width: 16, value: () => "Da approvare" },
      { key: "note", header: "Note proposta", width: 34, value: (row) => row.notes },
    ];
  } else if (type === "invitations_by_group") {
    columns = [
      { key: "groups", header: "Gruppi", width: 26, value: (row) => groups(row.contact, options.groups) },
      ...invitationBaseColumns(options).filter((column) => column.key !== "groups"),
    ];
  }

  return {
    title: `${eventExportTitle(type)} - ${eventTitle}`,
    subtitle: filterSummary([search ? `Ricerca: ${search}` : "", `${filteredRows.length} record`]),
    columns,
    rows: filteredRows,
  };
}

export function buildNotInvitedTable(
  eventTitle: string,
  contacts: ContactRecord[],
  options: { groups: ExportOption[]; references: ExportOption[] },
): ExportTable<ContactRecord> {
  return {
    title: `Lista non ancora invitati - ${eventTitle}`,
    subtitle: `${contacts.length} contatti attivi non presenti tra inviti o proposte pendenti`,
    columns: baseContactColumns(options),
    rows: contacts,
  };
}

export function contactLabels(contacts: ContactRecord[]) {
  return contacts.map((contact) => ({
    title: fullName(contact),
    lines: [
      contact.institutional_role ?? "",
      contact.institution ?? "",
      [contact.address_line, contact.postal_code, contact.city].filter(Boolean).join(" "),
      contact.country ?? "",
      contact.email ?? contact.email_2 ?? "",
    ].filter(Boolean),
  }));
}

export function eventLabels(rows: EventInvitationExportRow[]) {
  return rows.map((row) => ({
    title: row.contactName,
    lines: [
      row.contact.institutional_role ?? "",
      row.contact.institution ?? "",
      [row.contact.address_line, row.contact.postal_code, row.contact.city].filter(Boolean).join(" "),
      row.contact.country ?? "",
      row.contactEmail ?? "",
    ].filter(Boolean),
  }));
}
