import Link from "next/link";
import { notFound } from "next/navigation";
import { requireManager } from "@/lib/auth/profile";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { BuildSelection, type CandidateContact } from "./build-selection";
import { SearchableCheckboxFilter } from "./searchable-checkbox-filter";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;
type SearchParams = Record<string, string | string[] | undefined>;
type FilterMatchMode = "or" | "and";

const STATUS_LABELS: Record<string, string> = {
  active: "Attivi",
  standby: "Non attivi",
  all: "Tutti",
};

const PRIORITY_LABELS: Record<string, string> = {
  standard: "Standard",
  important: "Importante",
  critical: "Critica",
};

const MISSING_LABELS: Record<string, string> = {
  yes: "Con dati mancanti",
  no: "Dati completi",
};

const PAST_RESPONSE_LABELS: Record<string, string> = {
  attending: "Partecipa",
  declined: "Non partecipa",
  maybe: "Forse",
  no_response: "Nessuna risposta",
};

const PAST_ATTENDANCE_LABELS: Record<string, string> = {
  attended: "Presente",
  absent: "Assente",
  unknown: "Non verificata",
};

function values(params: SearchParams, key: string) {
  const raw = params[key];
  return (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function ids(params: SearchParams, key: string) {
  return [...new Set(values(params, key).map(Number).filter((value) => Number.isSafeInteger(value) && value > 0))];
}

function one(params: SearchParams, key: string) {
  return values(params, key)[0] ?? "";
}

function matchMode(params: SearchParams): FilterMatchMode {
  return one(params, "match") === "or" ? "or" : "and";
}

function selectedOptionLabels(selectedIds: number[], options: { id: number; label: string }[]) {
  const selected = new Set(selectedIds);
  const labels = options.filter((option) => selected.has(option.id)).map((option) => option.label);
  return labels.length > 0 ? labels.join(", ") : selectedIds.join(", ");
}

type CandidateSearchRow = {
  candidate: CandidateContact;
  total_count: number | null;
};

export default async function BuildEventInvitationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  await requireManager();
  const eventId = Number((await params).eventId);
  if (!Number.isSafeInteger(eventId) || eventId <= 0) notFound();

  const query = (await searchParams) ?? {};
  const search = one(query, "q").toLocaleLowerCase("it");
  const status = one(query, "status") || "active";
  const filterMatchMode = matchMode(query);
  const priority = one(query, "priority") || "all";
  const missing = one(query, "missing") || "all";
  const groupIds = ids(query, "groupIds");
  const referenceIds = ids(query, "referenceIds");
  const pastEventIds = ids(query, "pastEventIds");
  const pastResponse = one(query, "pastResponse") || "all";
  const pastAttendance = one(query, "pastAttendance") || "all";
  const page = Math.max(1, Number(one(query, "page")) || 1);
  const supabase = createSupabaseServiceClient();
  const offset = (page - 1) * PAGE_SIZE;

  const [
    eventResult,
    candidatesResult,
    groupsResult,
    referencesResult,
    eventsResult,
    approvedProposalsResult,
  ] = await Promise.all([
    supabase.from("events").select("id,title,starts_at").eq("id", eventId).maybeSingle(),
    supabase.rpc("event_candidate_contacts_page", {
      p_event_id: eventId,
      p_search: search,
      p_status: status,
      p_match: filterMatchMode,
      p_priority: priority,
      p_missing: missing,
      p_group_ids: groupIds,
      p_reference_ids: referenceIds,
      p_past_event_ids: pastEventIds,
      p_past_response: pastResponse,
      p_past_attendance: pastAttendance,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    }),
    supabase.from("groups").select("id,name,active").order("active", { ascending: false }).order("name"),
    supabase
      .from("internal_references")
      .select("id,full_name,active,profile_id")
      .is("deleted_at", null)
      .order("active", { ascending: false })
      .order("full_name"),
    supabase.from("events").select("id,title,starts_at").neq("id", eventId).order("starts_at", { ascending: false }).limit(600),
    supabase
      .from("invitation_proposals")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", "approved"),
  ]);

  if (eventResult.error) throw eventResult.error;
  if (!eventResult.data) notFound();
  for (const result of [candidatesResult, groupsResult, referencesResult, eventsResult, approvedProposalsResult]) {
    if (result.error) throw result.error;
  }

  const candidateRows = (candidatesResult.data ?? []) as unknown as CandidateSearchRow[];
  const candidates = candidateRows.map((row) => row.candidate);
  const totalCandidates = Number(candidateRows[0]?.total_count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCandidates / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const groupOptions = (groupsResult.data ?? []).map((group) => ({
    id: Number(group.id),
    label: `${group.name}${group.active ? "" : " (non attivo)"}`,
  }));
  const referenceOptions = (referencesResult.data ?? []).map((reference) => ({
    id: Number(reference.id),
    label: `${reference.full_name}${reference.active ? "" : " (non attivo)"}`,
  }));
  const pastEventOptions = (eventsResult.data ?? []).map((event) => ({
    id: Number(event.id),
    label: `${event.title} · ${new Date(event.starts_at).toLocaleDateString("it-IT")}`,
  }));
  const filterChips = [
    one(query, "q") ? `Ricerca: "${one(query, "q")}"` : null,
    status !== "active" ? `Stato: ${STATUS_LABELS[status] ?? status}` : null,
    priority !== "all" ? `Priorità: ${PRIORITY_LABELS[priority] ?? priority}` : null,
    groupIds.length > 0 ? `Gruppi: ${selectedOptionLabels(groupIds, groupOptions)}` : null,
    referenceIds.length > 0 ? `Referenti: ${selectedOptionLabels(referenceIds, referenceOptions)}` : null,
    missing !== "all" ? `Dati: ${MISSING_LABELS[missing] ?? missing}` : null,
    pastEventIds.length > 0 ? `Eventi passati: ${selectedOptionLabels(pastEventIds, pastEventOptions)}` : null,
    pastEventIds.length > 0 && pastResponse !== "all"
      ? `Risposta passata: ${PAST_RESPONSE_LABELS[pastResponse] ?? pastResponse}`
      : null,
    pastEventIds.length > 0 && pastAttendance !== "all"
      ? `Presenza passata: ${PAST_ATTENDANCE_LABELS[pastAttendance] ?? pastAttendance}`
      : null,
  ].filter((chip): chip is string => Boolean(chip));
  if (filterChips.length > 1) {
    filterChips.unshift(`Logica tra campi: ${filterMatchMode === "or" ? "OR" : "AND"}`);
  }

  const pageHref = (targetPage: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      for (const item of Array.isArray(value) ? value : value ? [value] : []) next.append(key, item);
    }
    next.set("page", String(targetPage));
    return `?${next.toString()}`;
  };

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6">
          <div className="flex flex-wrap gap-3 text-sm font-semibold text-[#d43c2f]">
            <Link href="/dashboard" className="hover:underline">← Dashboard</Link>
            <Link href="/dashboard/events" className="hover:underline">← Lista eventi</Link>
            <Link href={`/dashboard/events/${eventId}`} className="hover:underline">← Scheda evento</Link>
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-[#1b3272]">Costruisci lista: {eventResult.data.title}</h1>
          <p className="mt-2 text-sm text-slate-600">
            Più valori nello stesso campo sono alternativi tra loro. La logica tra campi può essere OR o AND.
          </p>
        </header>

        <form className="mb-6 grid gap-3 rounded-2xl border border-[#d9e1f2] bg-white p-5 shadow-sm md:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">
            Logica tra campi
            <select name="match" defaultValue={filterMatchMode} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5">
              <option value="and">AND</option>
              <option value="or">OR</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Ricerca
            <input name="q" defaultValue={one(query, "q")} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Stato
            <select name="status" defaultValue={status} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5">
              <option value="active">Attivi</option><option value="standby">Non attivi</option><option value="all">Tutti</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Priorità
            <select name="priority" defaultValue={priority} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5">
              <option value="all">Tutte</option><option value="standard">Standard</option><option value="important">Importante</option><option value="critical">Critica</option>
            </select>
          </label>
          <fieldset className="text-sm font-medium text-slate-700">
            <legend>Gruppi</legend>
            <SearchableCheckboxFilter
              name="groupIds"
              selectedIds={groupIds}
              searchLabel="Cerca gruppo"
              options={groupOptions}
            />
          </fieldset>
          <fieldset className="text-sm font-medium text-slate-700">
            <legend>Referenti associati</legend>
            <SearchableCheckboxFilter
              name="referenceIds"
              selectedIds={referenceIds}
              searchLabel="Cerca referente"
              options={referenceOptions}
            />
          </fieldset>
          <label className="text-sm font-medium text-slate-700">
            Dati mancanti
            <select name="missing" defaultValue={missing} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5">
              <option value="all">Tutti</option><option value="yes">Con dati mancanti</option><option value="no">Dati completi</option>
            </select>
          </label>
          <fieldset className="text-sm font-medium text-slate-700 md:col-span-3">
            <legend>Eventi passati</legend>
            <SearchableCheckboxFilter
              name="pastEventIds"
              selectedIds={pastEventIds}
              searchLabel="Cerca evento passato"
              options={pastEventOptions}
            />
          </fieldset>
          <label className="text-sm font-medium text-slate-700">
            Risposta negli eventi selezionati
            <select name="pastResponse" defaultValue={pastResponse} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5">
              <option value="all">Qualsiasi</option><option value="attending">Partecipa</option><option value="declined">Non partecipa</option><option value="maybe">Forse</option><option value="no_response">Nessuna risposta</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Presenza negli eventi selezionati
            <select name="pastAttendance" defaultValue={pastAttendance} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5">
              <option value="all">Qualsiasi</option><option value="attended">Presente</option><option value="absent">Assente</option><option value="unknown">Non verificata</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button className="rounded-xl bg-[#1b3272] px-4 py-2.5 text-sm font-semibold text-white">Applica filtri</button>
            <Link href={`/dashboard/events/${eventId}/build`} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Azzera</Link>
          </div>
        </form>

        <section className="mb-4 rounded-xl border border-[#d9e1f2] bg-[#f8fbff] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-[#1b3272]">
              {totalCandidates} candidati filtrati
            </span>
            <span className="text-xs text-slate-500">
              pagina {safePage} di {totalPages} · esclusi i contatti già in lista evento
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {filterChips.length > 0 ? (
              filterChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-[#1b3272]/20 bg-white px-3 py-1 text-xs font-semibold text-[#1b3272]"
                >
                  {chip}
                </span>
              ))
            ) : (
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                Nessun filtro applicato
              </span>
            )}
          </div>
        </section>
        <BuildSelection
          eventId={eventId}
          candidates={candidates}
          references={(referencesResult.data ?? [])
            .filter((reference) => reference.active && reference.profile_id)
            .map((reference) => ({ id: Number(reference.id), name: String(reference.full_name) }))}
          approvedProposalCount={approvedProposalsResult.count ?? 0}
        />

        {totalPages > 1 ? (
          <nav className="mt-6 flex items-center justify-between text-sm">
            <Link href={pageHref(Math.max(1, safePage - 1))} className={safePage === 1 ? "pointer-events-none opacity-40" : "font-semibold text-[#1b3272]"}>← Precedente</Link>
            <Link href={pageHref(Math.min(totalPages, safePage + 1))} className={safePage === totalPages ? "pointer-events-none opacity-40" : "font-semibold text-[#1b3272]"}>Successiva →</Link>
          </nav>
        ) : null}
      </div>
    </main>
  );
}
