import Link from "next/link";
import { requireManager } from "@/lib/auth/profile";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

type AuditLogRow = {
  id: number;
  table_name: string;
  record_id: string;
  action: "insert" | "update" | "delete";
  old_data: JsonRecord | null;
  new_data: JsonRecord | null;
  actor_profile_id: string | null;
  occurred_at: string;
};

type ContactVersionRow = {
  id: number;
  contact_id: number;
  version_number: number;
  action: "insert" | "update";
  snapshot: JsonRecord;
  changed_by_profile_id: string | null;
  created_at: string;
};

type ProfileSummary = {
  id: string;
  full_name: string;
  email: string | null;
};

type ContactSummary = {
  id: number;
  first_name: string;
  last_name: string;
  institution: string | null;
};

type AuditSearchParams = Record<string, string | string[] | undefined>;

const CONTACT_HISTORY_LIMIT = 40;
const AUDIT_LOG_LIMIT = 80;

const FIELD_LABELS: Record<string, string> = {
  honorific_title: "titolo",
  honorific_title_english: "titolo inglese",
  honorific_title_invitation: "titolo invito",
  first_name: "nome",
  last_name: "cognome",
  legacy_description: "descrizione Access",
  email: "email",
  email_2: "email 2",
  phone: "telefono",
  phone_home: "telefono casa",
  phone_office_2: "telefono ufficio 2",
  mobile_phone: "cellulare",
  fax: "fax",
  fax_home: "fax casa",
  telex_office: "telex ufficio",
  address_line: "indirizzo",
  postal_code: "CAP",
  city: "citta'",
  country: "paese",
  home_address_line: "indirizzo casa",
  home_postal_code: "CAP casa",
  home_city: "citta' casa",
  home_province: "provincia casa",
  home_country: "paese casa",
  office_name: "ufficio",
  office_address_line: "indirizzo ufficio",
  office_postal_code: "CAP ufficio",
  office_city: "citta' ufficio",
  office_province: "provincia ufficio",
  office_country: "paese ufficio",
  spoken_language: "lingua",
  spoken_language_2: "lingua 2",
  invitation_language: "lingua invito",
  translation_language: "lingua traduzione",
  institutional_role: "carica",
  institutional_role_english: "carica inglese",
  institutional_role_invitation: "carica invito",
  institution: "istituzione",
  legacy_salutation: "intestazione",
  religion: "religione",
  legacy_organization_name: "organizzazione Access",
  legacy_office_site: "sede ufficio Access",
  mail_address_preference: "preferenza indirizzo",
  legacy_contacts_raw: "referenti Access",
  accompanist: "accompagnatore",
  legacy_archive_type: "tipo archivio Access",
  legacy_invitation_group: "gruppo inviti Access",
  website: "sito web",
  website_2: "sito web 2",
  notes: "note",
  missing_data_notes: "note dati mancanti",
  status: "stato",
  priority: "priorita'",
  group_id: "gruppo",
  reference_id: "referente",
  is_primary: "referente principale",
  deleted_at: "eliminazione",
  invitation_status: "stato invito",
  response_status: "risposta",
  response_source: "origine risposta corrente",
  attendance_status: "presenza",
  source: "origine risposta",
  actor_profile_id: "autore risposta",
  response_token_id: "token risposta pubblica",
  previous_response_status: "risposta precedente",
  recorded_at: "data registrazione risposta",
  response_note: "nota risposta",
  companion_count: "numero accompagnatori",
  companion_names: "nomi accompagnatori",
  invited_at: "data invito",
  response_recorded_at: "data risposta",
  response_recorded_by_profile_id: "autore risposta",
  invitation_status_updated_at: "data variazione stato",
  invitation_status_updated_by_profile_id: "autore variazione stato",
};

const IGNORED_CHANGE_FIELDS = new Set([
  "created_at",
  "updated_at",
  "created_by_profile_id",
  "updated_by_profile_id",
  "deleted_by_profile_id",
  "selected_by_profile_id",
]);

function paramValue(searchParams: AuditSearchParams, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function parseContactId(searchParams: AuditSearchParams) {
  const contactId = Number(paramValue(searchParams, "contactId"));
  return Number.isSafeInteger(contactId) && contactId > 0 ? contactId : null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "vuoto";
  if (typeof value === "boolean") return value ? "si" : "no";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function displayName(contact?: ContactSummary) {
  if (!contact) return "Contatto non trovato";
  return (
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
    contact.institution ||
    `Contatto #${contact.id}`
  );
}

function actorName(profile?: ProfileSummary) {
  if (!profile) return "Sistema / import";
  return profile.full_name || profile.email || "Utente senza nome";
}

function actionLabel(action: string) {
  if (action === "insert") return "Creazione";
  if (action === "update") return "Modifica";
  if (action === "delete") return "Eliminazione";
  return action;
}

function tableLabel(tableName: string) {
  const labels: Record<string, string> = {
    contacts: "Contatti",
    contact_groups: "Gruppi contatto",
    contact_references: "Referenti contatto",
    internal_references: "Referenti",
    groups: "Gruppi",
    profiles: "Utenti",
    events: "Eventi",
    event_invitations: "Inviti evento",
    invitation_responses: "Storico risposte invito",
    invitation_response_tokens: "Token risposta invito",
    invitation_proposals: "Proposte invito",
    contact_languages: "Lingue contatto",
  };
  return labels[tableName] ?? tableName;
}

function changedFields(oldData: JsonRecord | null, newData: JsonRecord | null) {
  const keys = new Set([...Object.keys(oldData ?? {}), ...Object.keys(newData ?? {})]);
  return [...keys]
    .filter((key) => {
      if (IGNORED_CHANGE_FIELDS.has(key)) return false;
      return JSON.stringify(oldData?.[key] ?? null) !== JSON.stringify(newData?.[key] ?? null);
    })
    .sort();
}

function changedFieldRows(oldData: JsonRecord | null, newData: JsonRecord | null) {
  return changedFields(oldData, newData).map((field) => ({
    field,
    label: FIELD_LABELS[field] ?? field,
    before: oldData?.[field] ?? null,
    after: newData?.[field] ?? null,
  }));
}

function changeSummary(oldData: JsonRecord | null, newData: JsonRecord | null, limit = 4) {
  const fields = changedFields(oldData, newData);
  if (fields.length === 0) return "Nessun campo dati rilevante";

  const visibleFields = fields.slice(0, limit).map((field) => {
    const label = FIELD_LABELS[field] ?? field;
    if (!oldData || !newData) return label;
    return `${label}: ${displayValue(oldData[field])} -> ${displayValue(newData[field])}`;
  });
  const extraCount = fields.length - visibleFields.length;
  return extraCount > 0 ? `${visibleFields.join("; ")}; +${extraCount} altri` : visibleFields.join("; ");
}

function ChangeRows({
  oldData,
  newData,
  emptyLabel = "Nessun campo operativo cambiato.",
}: {
  oldData: JsonRecord | null;
  newData: JsonRecord | null;
  emptyLabel?: string;
}) {
  const rows = changedFieldRows(oldData, newData);

  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">{emptyLabel}</p>;
  }

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 normal-case tracking-normal">Campo</th>
            <th className="px-3 py-2 normal-case tracking-normal">Prima</th>
            <th className="px-3 py-2 normal-case tracking-normal">Dopo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row) => (
            <tr key={row.field} className="align-top">
              <td className="w-36 px-3 py-2 font-semibold text-slate-700">{row.label}</td>
              <td className="max-w-64 whitespace-pre-wrap break-words px-3 py-2 text-slate-600">
                {displayValue(row.before)}
              </td>
              <td className="max-w-64 whitespace-pre-wrap break-words px-3 py-2 text-slate-900">
                {displayValue(row.after)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function fetchProfilesById(ids: string[]) {
  if (ids.length === 0) return new Map<string, ProfileSummary>();

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id,full_name,email")
    .in("id", ids);

  if (error) throw error;
  return new Map((data ?? []).map((profile) => [profile.id, profile as ProfileSummary]));
}

async function fetchContactsById(ids: number[]) {
  if (ids.length === 0) return new Map<number, ContactSummary>();

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("id,first_name,last_name,institution")
    .in("id", ids);

  if (error) throw error;
  return new Map((data ?? []).map((contact) => [Number(contact.id), contact as ContactSummary]));
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams?: Promise<AuditSearchParams>;
}) {
  await requireManager();

  const params = (await searchParams) ?? {};
  const contactId = parseContactId(params);
  const supabase = createSupabaseServiceClient();

  let versionsQuery = supabase
    .from("contact_versions")
    .select("id,contact_id,version_number,action,snapshot,changed_by_profile_id,created_at")
    .order("created_at", { ascending: false })
    .limit(CONTACT_HISTORY_LIMIT);

  let auditQuery = supabase
    .from("audit_logs")
    .select("id,table_name,record_id,action,old_data,new_data,actor_profile_id,occurred_at")
    .order("occurred_at", { ascending: false })
    .limit(AUDIT_LOG_LIMIT);

  if (contactId) {
    versionsQuery = versionsQuery.eq("contact_id", contactId);
    auditQuery = auditQuery.or(
      `and(table_name.eq.contacts,record_id.eq.${contactId}),and(table_name.eq.contact_groups,record_id.eq.${contactId}),and(table_name.eq.contact_references,record_id.eq.${contactId})`,
    );
  }

  const [versionsResult, auditResult] = await Promise.all([versionsQuery, auditQuery]);
  if (versionsResult.error) throw versionsResult.error;
  if (auditResult.error) throw auditResult.error;

  const versions = (versionsResult.data ?? []) as ContactVersionRow[];
  const auditLogs = (auditResult.data ?? []) as AuditLogRow[];
  const profileIds = [
    ...new Set(
      [
        ...versions.map((version) => version.changed_by_profile_id),
        ...auditLogs.map((log) => log.actor_profile_id),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  const contactIds = [
    ...new Set([
      ...versions.map((version) => Number(version.contact_id)),
      ...(contactId ? [contactId] : []),
    ]),
  ];
  const [profilesById, contactsById] = await Promise.all([
    fetchProfilesById(profileIds),
    fetchContactsById(contactIds),
  ]);
  const selectedContact = contactId ? contactsById.get(contactId) : undefined;
  const previousVersionById = new Map<number, ContactVersionRow | null>();
  const versionsByContact = new Map<number, ContactVersionRow[]>();

  for (const version of versions) {
    versionsByContact.set(Number(version.contact_id), [
      ...(versionsByContact.get(Number(version.contact_id)) ?? []),
      version,
    ]);
  }

  for (const contactVersions of versionsByContact.values()) {
    const sortedVersions = [...contactVersions].sort(
      (a, b) => Number(a.version_number) - Number(b.version_number),
    );
    sortedVersions.forEach((version, index) => {
      previousVersionById.set(version.id, sortedVersions[index - 1] ?? null);
    });
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <Link href="/dashboard" className="text-sm font-semibold text-[#d43c2f] hover:underline">← Dashboard</Link>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold text-[#1b3272]">Storico e audit</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Registro consultabile dai manager per modifiche contatto, associazioni e operazioni principali.
              </p>
            </div>
            {contactId ? (
              <Link
                href="/dashboard/audit"
                className="rounded-xl border border-[#d9e1f2] bg-white px-4 py-2.5 text-sm font-semibold text-[#1b3272] shadow-sm hover:border-[#d43c2f]"
              >
                Mostra tutto
              </Link>
            ) : null}
          </div>
          {contactId ? (
            <p className="mt-4 rounded-xl border border-[#d9e1f2] bg-white px-4 py-3 text-sm text-slate-700">
              Filtro attivo: {displayName(selectedContact)} <span className="text-slate-500">#{contactId}</span>
            </p>
          ) : null}
        </header>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="rounded-2xl border border-[#d9e1f2] bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-[#1b3272]">Versioni contatto</h2>
              <p className="mt-1 text-sm text-slate-600">Snapshot del record contatto dopo ogni creazione o modifica.</p>
            </div>
            <div className="divide-y divide-slate-100">
              {versions.length === 0 ? (
                <p className="px-5 py-8 text-sm text-slate-500">Nessuna versione trovata.</p>
              ) : (
                versions.map((version) => {
                  const profile = version.changed_by_profile_id
                    ? profilesById.get(version.changed_by_profile_id)
                    : undefined;
                  const contact = contactsById.get(Number(version.contact_id));
                  const previousVersion = previousVersionById.get(version.id);

                  return (
                    <article key={version.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-slate-900">
                            {displayName(contact)}
                          </h3>
                          <p className="mt-1 text-xs text-slate-500">
                            Versione {version.version_number} · {actionLabel(version.action)} · {formatDate(version.created_at)}
                          </p>
                        </div>
                        <Link
                          href={`/dashboard/audit?contactId=${version.contact_id}`}
                          className="text-xs font-semibold text-[#d43c2f] hover:underline"
                        >
                          Filtra
                        </Link>
                      </div>
                      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Autore</dt>
                          <dd className="mt-1 text-slate-800">{actorName(profile)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stato</dt>
                          <dd className="mt-1 text-slate-800">{displayValue(version.snapshot.status)}</dd>
                        </div>
                      </dl>
                      <div className="mt-4">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Cosa e&apos; cambiato
                        </h4>
                        {version.action === "insert" ? (
                          <p className="mt-2 text-sm text-slate-600">
                            Primo snapshot del contatto.
                          </p>
                        ) : previousVersion ? (
                          <ChangeRows
                            oldData={previousVersion.snapshot}
                            newData={version.snapshot}
                            emptyLabel="Solo metadati tecnici aggiornati."
                          />
                        ) : (
                          <p className="mt-2 text-sm text-slate-500">
                            La versione precedente non e&apos; inclusa in questa vista.
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#d9e1f2] bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-[#1b3272]">Audit generale</h2>
              <p className="mt-1 text-sm text-slate-600">Prima/dopo sintetico per tabelle operative tracciate.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-[#f8fafc] text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 normal-case tracking-normal">Quando</th>
                    <th className="px-4 py-3 normal-case tracking-normal">Autore</th>
                    <th className="px-4 py-3 normal-case tracking-normal">Oggetto</th>
                    <th className="px-4 py-3 normal-case tracking-normal">Modifica</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                        Nessun log trovato.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => {
                      const profile = log.actor_profile_id ? profilesById.get(log.actor_profile_id) : undefined;

                      return (
                        <tr key={log.id} className="align-top">
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(log.occurred_at)}</td>
                          <td className="px-4 py-3 text-slate-700">{actorName(profile)}</td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-[#1b3272]">{tableLabel(log.table_name)}</div>
                            <div className="mt-1 text-xs text-slate-500">Record {log.record_id}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            <p>
                              <span className="font-semibold text-slate-900">{actionLabel(log.action)}: </span>
                              {changeSummary(log.old_data, log.new_data)}
                            </p>
                            {log.action === "update" ? (
                              <ChangeRows
                                oldData={log.old_data}
                                newData={log.new_data}
                                emptyLabel="Solo metadati tecnici aggiornati."
                              />
                            ) : null}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
