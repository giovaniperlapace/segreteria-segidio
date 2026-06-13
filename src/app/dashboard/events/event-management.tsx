"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { createEventAction, updateEventAction } from "./actions";
import { ActionMessage, inputClass, SubmitButton, useArchiveAction } from "../archive-ui";

export type EventRecord = {
  id: number;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  organizational_notes: string | null;
  status: "draft" | "active" | "concluded" | "archived";
  legacy_access_id: number | null;
  invitation_count: number;
  attending_count: number;
  attended_count: number;
  attention_count: number;
};

const EVENT_STATUS_LABELS: Record<EventRecord["status"], string> = {
  draft: "Bozza",
  active: "Attivo",
  concluded: "Concluso",
  archived: "Archiviato",
};
type EventViewMode = "cards" | "table";
type EventSortKey = "title" | "starts_at" | "status" | "invitation_count" | "attending_count" | "attended_count" | "attention_count";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function compareValues(a: string | number, b: string | number, direction: "asc" | "desc") {
  const result =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), "it", { sensitivity: "base" });

  return direction === "asc" ? result : -result;
}

function inputDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function EventFields({ event }: { event?: EventRecord }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-sm font-medium text-slate-700">
        Titolo
        <input name="title" required defaultValue={event?.title ?? ""} className={inputClass} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Stato
        <select name="status" defaultValue={event?.status ?? "draft"} className={inputClass}>
          <option value="draft">Bozza</option>
          <option value="active">Attivo</option>
          <option value="concluded">Concluso</option>
          <option value="archived">Archiviato</option>
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">
        Inizio
        <input
          name="startsAt"
          type="datetime-local"
          required
          defaultValue={inputDateTime(event?.starts_at ?? null)}
          className={inputClass}
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Fine
        <input
          name="endsAt"
          type="datetime-local"
          defaultValue={inputDateTime(event?.ends_at ?? null)}
          className={inputClass}
        />
      </label>
      <label className="text-sm font-medium text-slate-700 md:col-span-2">
        Luogo
        <input name="location" defaultValue={event?.location ?? ""} className={inputClass} />
      </label>
      <label className="text-sm font-medium text-slate-700 md:col-span-2">
        Descrizione
        <textarea name="description" rows={2} defaultValue={event?.description ?? ""} className={inputClass} />
      </label>
      <label className="text-sm font-medium text-slate-700 md:col-span-2">
        Note organizzative
        <textarea
          name="organizationalNotes"
          rows={2}
          defaultValue={event?.organizational_notes ?? ""}
          className={inputClass}
        />
      </label>
    </div>
  );
}

function CreateEventForm() {
  const [state, action, pending] = useArchiveAction(createEventAction);
  return (
    <form action={action} className="space-y-4">
      <EventFields />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending}>Crea evento</SubmitButton>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

function EventModal({
  event,
  onClose,
}: {
  event: EventRecord;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useArchiveAction(updateEventAction);

  useEffect(() => {
    if (state.status !== "success") return;
    router.refresh();
  }, [router, state.status]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/35 px-4 py-8">
      <div className="w-full max-w-3xl rounded-2xl border border-[#d9e1f2] bg-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-xl font-semibold text-[#1b3272]">{event.title}</h2>
            <p className="mt-2 text-sm text-slate-600">
              {formatDateTime(event.starts_at)}
              {event.location ? ` · ${event.location}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Chiudi
          </button>
        </div>
        <div className="grid gap-2 px-5 py-4 text-sm sm:grid-cols-4">
            <span className="rounded-xl bg-slate-50 px-3 py-2 text-slate-700">
              <strong className="text-[#1b3272]">{event.invitation_count}</strong> invitati
            </span>
            <span className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800">
              <strong>{event.attending_count}</strong> risposte si&apos;
            </span>
            <span className="rounded-xl bg-sky-50 px-3 py-2 text-sky-800">
              <strong>{event.attended_count}</strong> presenze
            </span>
            <span className={`rounded-xl px-3 py-2 ${event.attention_count > 0 ? "bg-amber-100 text-amber-900" : "bg-slate-50 text-slate-700"}`}>
              <strong>{event.attention_count}</strong> flag
            </span>
        </div>
        <form action={action} className="space-y-4 border-t border-slate-200 px-5 py-5">
          <input type="hidden" name="eventId" value={event.id} />
          <EventFields
            key={`${event.id}:${event.title}:${event.starts_at}:${event.ends_at ?? ""}:${event.location ?? ""}:${event.status}`}
            event={event}
          />
          {event.legacy_access_id ? (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              Evento importato da Access #{event.legacy_access_id}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton pending={pending}>Salva evento</SubmitButton>
            <Link
              href={`/dashboard/events/${event.id}`}
              className="rounded-xl border border-[#1b3272] bg-white px-4 py-2.5 text-sm font-semibold text-[#1b3272] hover:bg-[#1b3272]/10"
            >
              Lista invitati
            </Link>
            <ActionMessage state={state} />
          </div>
        </form>
      </div>
    </div>
  );
}

function EventCard({ event, onOpen }: { event: EventRecord; onOpen: (event: EventRecord) => void }) {
  const isFlagged = event.attention_count > 0;
  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-sm ${isFlagged ? "border-amber-300 bg-amber-50/40" : "border-[#d9e1f2]"}`}
    >
      <div className="flex min-h-24 flex-col justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onOpen(event)}
              className="text-left text-base font-semibold text-[#1b3272] hover:underline"
            >
              {event.title}
            </button>
            <span className="rounded-full bg-[#1b3272]/10 px-2 py-0.5 text-xs font-semibold text-[#1b3272]">
              {EVENT_STATUS_LABELS[event.status]}
            </span>
            {event.legacy_access_id ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                Access #{event.legacy_access_id}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {formatDateTime(event.starts_at)}
            {event.location ? ` · ${event.location}` : ""}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="rounded-xl bg-slate-50 px-3 py-2 text-slate-700">
            <strong className="text-[#1b3272]">{event.invitation_count}</strong> invitati
          </span>
          <span className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800">
            <strong>{event.attending_count}</strong> si&apos;
          </span>
          <span className="rounded-xl bg-sky-50 px-3 py-2 text-sky-800">
            <strong>{event.attended_count}</strong> presenze
          </span>
          <span className={`rounded-xl px-3 py-2 ${isFlagged ? "bg-amber-100 text-amber-900" : "bg-slate-50 text-slate-700"}`}>
            <strong>{event.attention_count}</strong> flag
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onOpen(event)}
            className="rounded-xl border border-[#d9e1f2] bg-white px-3 py-2 text-sm font-semibold text-[#1b3272] hover:border-[#d43c2f]"
          >
            Apri scheda
          </button>
          <Link
            href={`/dashboard/events/${event.id}`}
            className="rounded-xl bg-[#1b3272] px-3 py-2 text-sm font-semibold text-white hover:bg-[#263f86]"
          >
            Lista invitati
          </Link>
        </div>
      </div>
    </article>
  );
}

function EventsTable({
  events,
  sortKey,
  sortDirection,
  statusFilter,
  onSort,
  onStatusFilterChange,
  onOpen,
}: {
  events: EventRecord[];
  sortKey: EventSortKey;
  sortDirection: "asc" | "desc";
  statusFilter: "all" | "open" | EventRecord["status"];
  onSort: (key: EventSortKey) => void;
  onStatusFilterChange: (status: "all" | "open" | EventRecord["status"]) => void;
  onOpen: (event: EventRecord) => void;
}) {
  function sortLabel(key: EventSortKey) {
    if (sortKey !== key) return "";
    return sortDirection === "asc" ? " ↑" : " ↓";
  }

  function header(key: EventSortKey, label: string) {
    return (
      <button
        type="button"
        onClick={() => onSort(key)}
        className="font-semibold text-[#1b3272] hover:text-[#d43c2f]"
      >
        {label}
        {sortLabel(key)}
      </button>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#d9e1f2] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-[#f8fafc] text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 normal-case tracking-normal">{header("title", "Evento")}</th>
              <th className="px-4 py-3 normal-case tracking-normal">{header("starts_at", "Data")}</th>
              <th className="px-4 py-3 normal-case tracking-normal">
                <div className="grid gap-1">
                  {header("status", "Stato")}
                  <select
                    value={statusFilter}
                    onChange={(event) => onStatusFilterChange(event.target.value as "all" | "open" | EventRecord["status"])}
                    onClick={(event) => event.stopPropagation()}
                    className="w-40 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium normal-case tracking-normal text-slate-800 focus:border-[#d43c2f] focus:outline-none focus:ring-2 focus:ring-[#d43c2f]/20"
                    aria-label="Filtra tabella eventi per stato"
                  >
                    <option value="open">Bozza o attivi</option>
                    <option value="all">Tutti</option>
                    <option value="draft">Bozza</option>
                    <option value="active">Attivo</option>
                    <option value="concluded">Concluso</option>
                    <option value="archived">Archiviato</option>
                  </select>
                </div>
              </th>
              <th className="px-4 py-3 text-right normal-case tracking-normal">{header("invitation_count", "Invitati")}</th>
              <th className="px-4 py-3 text-right normal-case tracking-normal">{header("attending_count", "Risposte si'")}</th>
              <th className="px-4 py-3 text-right normal-case tracking-normal">{header("attended_count", "Presenze")}</th>
              <th className="px-4 py-3 text-right normal-case tracking-normal">{header("attention_count", "Flag")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {events.map((event) => (
              <tr
                key={event.id}
                onClick={() => onOpen(event)}
                className={`cursor-pointer align-top hover:bg-[#f8fafc] ${event.attention_count > 0 ? "bg-amber-50/50" : ""}`}
              >
                <td className="px-4 py-3">
                  <button type="button" className="text-left font-semibold text-[#1b3272] hover:underline">
                    {event.title}
                  </button>
                  <div className="mt-1 text-xs text-slate-500">
                    {[event.location, event.legacy_access_id ? `Access #${event.legacy_access_id}` : null].filter(Boolean).join(" · ")}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDateTime(event.starts_at)}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-[#1b3272]/10 px-2.5 py-1 text-xs font-semibold text-[#1b3272]">
                    {EVENT_STATUS_LABELS[event.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-slate-700">{event.invitation_count}</td>
                <td className="px-4 py-3 text-right text-emerald-800">{event.attending_count}</td>
                <td className="px-4 py-3 text-right text-sky-800">{event.attended_count}</td>
                <td className="px-4 py-3 text-right text-slate-700">{event.attention_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EventManagement({ events }: { events: EventRecord[] }) {
  const [viewMode, setViewMode] = useState<EventViewMode>("cards");
  const [search, setSearch] = useState("");
  const hasOpenEvents = events.some((event) => event.status === "draft" || event.status === "active");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | EventRecord["status"]>(
    hasOpenEvents ? "open" : "all",
  );
  const [sortKey, setSortKey] = useState<EventSortKey>("starts_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const deferredSearch = useDeferredValue(search);

  function toggleSort(nextKey: EventSortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "starts_at" ? "desc" : "asc");
  }

  const visibleEvents = useMemo(() => {
    const term = normalizeSearch(deferredSearch.trim());
    return events
      .filter((event) => {
        if (statusFilter === "open" && event.status !== "draft" && event.status !== "active") return false;
        if (statusFilter !== "all" && statusFilter !== "open" && event.status !== statusFilter) return false;
        if (!term) return true;
        return normalizeSearch(
          [event.title, event.description, event.location, EVENT_STATUS_LABELS[event.status], event.legacy_access_id].filter(Boolean).join(" "),
        ).includes(term);
      })
      .sort((a, b) => {
        const values: Record<EventSortKey, [string | number, string | number]> = {
          title: [a.title, b.title],
          starts_at: [new Date(a.starts_at).getTime(), new Date(b.starts_at).getTime()],
          status: [EVENT_STATUS_LABELS[a.status], EVENT_STATUS_LABELS[b.status]],
          invitation_count: [a.invitation_count, b.invitation_count],
          attending_count: [a.attending_count, b.attending_count],
          attended_count: [a.attended_count, b.attended_count],
          attention_count: [a.attention_count, b.attention_count],
        };
        const [aValue, bValue] = values[sortKey];
        return compareValues(aValue, bValue, sortDirection);
      });
  }, [deferredSearch, events, sortDirection, sortKey, statusFilter]);
  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return null;
    return events.find((event) => event.id === selectedEventId) ?? null;
  }, [events, selectedEventId]);

  return (
    <div className="space-y-8">
      <details className="rounded-2xl border border-[#d9e1f2] bg-white px-5 py-4 shadow-sm">
        <summary className="cursor-pointer text-lg font-semibold text-[#1b3272]">Nuovo evento</summary>
        <div className="mt-5 border-t border-slate-200 pt-5">
          <CreateEventForm />
        </div>
      </details>

      <section className="rounded-2xl border border-[#d9e1f2] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[#1b3272]">Archivio eventi</h2>
            <p className="mt-1 text-sm text-slate-600">
              {visibleEvents.length} mostrati di {events.length} eventi
            </p>
          </div>
          <div className="flex rounded-xl border border-slate-300 bg-white p-1 text-sm font-semibold">
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`rounded-lg px-3 py-2 ${
                viewMode === "cards" ? "bg-[#1b3272] text-white" : "text-[#1b3272] hover:bg-[#1b3272]/10"
              }`}
              aria-pressed={viewMode === "cards"}
            >
              Schede
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`rounded-lg px-3 py-2 ${
                viewMode === "table" ? "bg-[#1b3272] text-white" : "text-[#1b3272] hover:bg-[#1b3272]/10"
              }`}
              aria-pressed={viewMode === "table"}
            >
              Tabella
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cerca negli eventi mostrati"
            className={inputClass}
            type="search"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | "open" | EventRecord["status"])}
            className={inputClass}
            aria-label="Filtra eventi mostrati per stato"
          >
            <option value="open">Bozza o attivi</option>
            <option value="all">Tutti gli stati caricati</option>
            <option value="draft">Bozza</option>
            <option value="active">Attivo</option>
            <option value="concluded">Concluso</option>
            <option value="archived">Archiviato</option>
          </select>
        </div>
      </section>

      {viewMode === "table" ? (
          <EventsTable
          events={visibleEvents}
          sortKey={sortKey}
          sortDirection={sortDirection}
          statusFilter={statusFilter}
          onSort={toggleSort}
          onStatusFilterChange={setStatusFilter}
          onOpen={(event) => setSelectedEventId(event.id)}
        />
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleEvents.map((event) => (
            <EventCard key={event.id} event={event} onOpen={(item) => setSelectedEventId(item.id)} />
          ))}
        </section>
      )}

      {visibleEvents.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-slate-500">
            Nessun evento trovato.
          </p>
      ) : null}
      {selectedEvent ? <EventModal event={selectedEvent} onClose={() => setSelectedEventId(null)} /> : null}
    </div>
  );
}
