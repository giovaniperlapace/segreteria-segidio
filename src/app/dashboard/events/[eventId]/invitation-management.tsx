"use client";

import { useDeferredValue, useMemo, useState, useSyncExternalStore } from "react";
import { addInvitationAction, removeInvitationAction, updateInvitationAction } from "../actions";
import { ActionMessage, inputClass, PendingSpinner, SubmitButton, useArchiveAction } from "../../archive-ui";
import {
  ContactEditor,
  type ContactRecord,
  type LanguageOption,
  type Option,
} from "../../contacts/contact-management";

type ContactOption = {
  id: number;
  name: string;
  detail: string;
};

export type EventInvitationRecord = {
  id: number;
  event_id: number;
  contact_id: number;
  response_status: "no_response" | "attending" | "declined" | "maybe";
  attendance_status: "unknown" | "attended" | "absent";
  attention_flag: boolean;
  attention_note: string | null;
  notes: string | null;
  legacy_invited_raw: string | null;
  legacy_viene_raw: string | null;
  legacy_presence_raw: string | null;
  contact_name: string;
  contact_detail: string;
  contact_email: string | null;
  contact: ContactRecord;
};

type InvitationViewMode = "cards" | "table";
type InvitationSortKey =
  | "name"
  | "detail"
  | "response"
  | "attendance"
  | "flag";
type SortDirection = "asc" | "desc";

const RESPONSE_LABELS: Record<EventInvitationRecord["response_status"], string> = {
  no_response: "Nessuna risposta",
  attending: "Partecipa",
  declined: "Non partecipa",
  maybe: "Forse",
};

const ATTENDANCE_LABELS: Record<EventInvitationRecord["attendance_status"], string> = {
  unknown: "Non verificata",
  attended: "Presente",
  absent: "Assente",
};

function AddInvitationForm({
  eventId,
  contacts,
}: {
  eventId: number;
  contacts: ContactOption[];
}) {
  const [state, action, pending] = useArchiveAction(addInvitationAction);
  return (
    <form action={action} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
      <input type="hidden" name="eventId" value={eventId} />
      <label className="text-sm font-medium text-slate-700">
        Aggiungi invitato
        <select name="contactId" className={inputClass} defaultValue="">
          <option value="" disabled>Seleziona un contatto</option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.name}{contact.detail ? ` - ${contact.detail}` : ""}
            </option>
          ))}
        </select>
      </label>
      <SubmitButton pending={pending}>Aggiungi</SubmitButton>
      <div className="md:col-span-2">
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

function InvitationEditor({ invitation }: { invitation: EventInvitationRecord }) {
  const [state, action, pending] = useArchiveAction(updateInvitationAction);
  const [deleteState, deleteAction, deletePending] = useArchiveAction(removeInvitationAction);

  return (
    <div className="space-y-4">
      <form action={action} className="grid gap-3 md:grid-cols-2">
        <input type="hidden" name="invitationId" value={invitation.id} />
        <input type="hidden" name="eventId" value={invitation.event_id} />
        <label className="text-sm font-medium text-slate-700">
          Risposta
          <select name="responseStatus" defaultValue={invitation.response_status} className={inputClass}>
            <option value="no_response">Nessuna risposta</option>
            <option value="attending">Partecipa</option>
            <option value="declined">Non partecipa</option>
            <option value="maybe">Forse</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Presenza
          <select name="attendanceStatus" defaultValue={invitation.attendance_status} className={inputClass}>
            <option value="unknown">Non verificata</option>
            <option value="attended">Presente</option>
            <option value="absent">Assente</option>
          </select>
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
          <input
            name="attentionFlag"
            type="checkbox"
            defaultChecked={invitation.attention_flag}
            className="h-4 w-4 accent-[#1b3272]"
          />
          Da seguire in questo evento
        </label>
        <label className="text-sm font-medium text-slate-700">
          Nota flag
          <input name="attentionNote" defaultValue={invitation.attention_note ?? ""} className={inputClass} />
        </label>
        <label className="text-sm font-medium text-slate-700 md:col-span-2">
          Note invito
          <textarea name="notes" rows={3} defaultValue={invitation.notes ?? ""} className={inputClass} />
        </label>
        {invitation.legacy_invited_raw || invitation.legacy_viene_raw || invitation.legacy_presence_raw ? (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 md:col-span-2">
            Access: Invitato={invitation.legacy_invited_raw || "-"} · Viene={invitation.legacy_viene_raw || "-"} · Presenza={invitation.legacy_presence_raw || "-"}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <SubmitButton pending={pending}>Salva invito</SubmitButton>
          <ActionMessage state={state} />
        </div>
      </form>
      <form
        action={deleteAction}
        onSubmit={(event) => {
          if (!window.confirm(`Rimuovere ${invitation.contact_name} dalla lista evento?`)) {
            event.preventDefault();
          }
        }}
        className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4"
      >
        <input type="hidden" name="invitationId" value={invitation.id} />
        <input type="hidden" name="eventId" value={invitation.event_id} />
        <button
          type="submit"
          disabled={deletePending}
          className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-wait disabled:opacity-60"
        >
          {deletePending ? <PendingSpinner /> : null}
          Rimuovi dalla lista
        </button>
        <ActionMessage state={deleteState} />
      </form>
    </div>
  );
}

function InvitationBadges({ invitation }: { invitation: EventInvitationRecord }) {
  return (
    <div className="flex flex-wrap gap-2 text-xs font-semibold">
      <span className="rounded-full bg-[#1b3272]/10 px-2.5 py-1 text-[#1b3272]">
        {RESPONSE_LABELS[invitation.response_status]}
      </span>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
        {ATTENDANCE_LABELS[invitation.attendance_status]}
      </span>
      {invitation.attention_flag ? (
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">Da seguire</span>
      ) : null}
    </div>
  );
}

function InvitationCard({
  invitation,
  onOpenInvitation,
  onOpenContact,
}: {
  invitation: EventInvitationRecord;
  onOpenInvitation: (invitation: EventInvitationRecord) => void;
  onOpenContact: (contact: ContactRecord) => void;
}) {
  return (
    <article
      className={`flex min-h-[170px] flex-col justify-between rounded-xl border p-4 shadow-sm ${
        invitation.attention_flag
          ? "border-amber-300 bg-amber-50/60"
          : "border-[#d9e1f2] bg-white"
      }`}
    >
      <div>
        <button
          type="button"
          onClick={() => onOpenContact(invitation.contact)}
          className="text-left font-semibold text-[#1b3272] hover:underline"
        >
          {invitation.contact_name}
        </button>
        <p className="mt-1 line-clamp-2 text-sm text-slate-600">
          {[invitation.contact_detail, invitation.contact_email].filter(Boolean).join(" · ") ||
            "Nessun dettaglio"}
        </p>
        {invitation.attention_note ? (
          <p className="mt-2 line-clamp-2 text-xs font-medium text-amber-900">
            {invitation.attention_note}
          </p>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <InvitationBadges invitation={invitation} />
        <button
          type="button"
          onClick={() => onOpenInvitation(invitation)}
          className="rounded-lg bg-[#1b3272] px-3 py-2 text-sm font-semibold text-white hover:bg-[#263f86]"
        >
          Apri invito
        </button>
      </div>
    </article>
  );
}

function InvitationsTable({
  invitations,
  sortKey,
  sortDirection,
  onSort,
  onOpenInvitation,
  onOpenContact,
}: {
  invitations: EventInvitationRecord[];
  sortKey: InvitationSortKey;
  sortDirection: SortDirection;
  onSort: (key: InvitationSortKey) => void;
  onOpenInvitation: (invitation: EventInvitationRecord) => void;
  onOpenContact: (contact: ContactRecord) => void;
}) {
  function header(key: InvitationSortKey, label: string) {
    const arrow = sortKey === key ? (sortDirection === "asc" ? " ↑" : " ↓") : "";
    return (
      <button
        type="button"
        onClick={() => onSort(key)}
        className="font-semibold text-[#1b3272] hover:text-[#d43c2f]"
      >
        {label}{arrow}
      </button>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#d9e1f2] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-4 py-3">{header("name", "Contatto")}</th>
              <th className="px-4 py-3">{header("detail", "Carica / Istituzione")}</th>
              <th className="px-4 py-3">{header("response", "Risposta")}</th>
              <th className="px-4 py-3">{header("attendance", "Presenza")}</th>
              <th className="px-4 py-3">{header("flag", "Da seguire")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invitations.map((invitation) => (
              <tr
                key={invitation.id}
                onClick={() => onOpenInvitation(invitation)}
                className={`cursor-pointer hover:bg-slate-50 ${
                  invitation.attention_flag ? "bg-amber-50/60" : "bg-white"
                }`}
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenContact(invitation.contact);
                    }}
                    className="text-left font-semibold text-[#1b3272] hover:underline"
                  >
                    {invitation.contact_name}
                  </button>
                  {invitation.contact_email ? (
                    <div className="mt-1 text-xs text-slate-500">{invitation.contact_email}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-slate-700">{invitation.contact_detail || "—"}</td>
                <td className="px-4 py-3 text-slate-700">{RESPONSE_LABELS[invitation.response_status]}</td>
                <td className="px-4 py-3 text-slate-700">{ATTENDANCE_LABELS[invitation.attendance_status]}</td>
                <td className="px-4 py-3 text-slate-700">
                  {invitation.attention_flag ? invitation.attention_note || "Sì" : "No"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function InvitationManagement({
  eventId,
  invitations,
  contactOptions,
  groups,
  references,
  languages,
}: {
  eventId: number;
  invitations: EventInvitationRecord[];
  contactOptions: ContactOption[];
  groups: Option[];
  references: Option[];
  languages: LanguageOption[];
}) {
  const [search, setSearch] = useState("");
  const [responseFilter, setResponseFilter] = useState("all");
  const [attendanceFilter, setAttendanceFilter] = useState("all");
  const [flagFilter, setFlagFilter] = useState("all");
  const [sortKey, setSortKey] = useState<InvitationSortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedInvitation, setSelectedInvitation] = useState<EventInvitationRecord | null>(null);
  const [selectedContact, setSelectedContact] = useState<ContactRecord | null>(null);
  const deferredSearch = useDeferredValue(search);
  const viewPreferenceKey = `event-invitations-view:${eventId}`;
  const viewMode = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("storage", onStoreChange);
      window.addEventListener("event-invitations-view-change", onStoreChange);
      return () => {
        window.removeEventListener("storage", onStoreChange);
        window.removeEventListener("event-invitations-view-change", onStoreChange);
      };
    },
    () => window.localStorage.getItem(viewPreferenceKey) === "table" ? "table" : "cards",
    () => "cards",
  ) as InvitationViewMode;

  function changeViewMode(nextMode: InvitationViewMode) {
    window.localStorage.setItem(viewPreferenceKey, nextMode);
    window.dispatchEvent(new Event("event-invitations-view-change"));
  }

  function toggleSort(nextKey: InvitationSortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(nextKey);
    setSortDirection("asc");
  }

  const visibleInvitations = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    const filtered = invitations.filter((invitation) => {
      const haystack = [
        invitation.contact_name,
        invitation.contact_detail,
        invitation.contact_email,
        invitation.attention_note,
        invitation.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        (!term || haystack.includes(term)) &&
        (responseFilter === "all" || invitation.response_status === responseFilter) &&
        (attendanceFilter === "all" || invitation.attendance_status === attendanceFilter) &&
        (flagFilter === "all" ||
          (flagFilter === "flagged" ? invitation.attention_flag : !invitation.attention_flag))
      );
    });

    const direction = sortDirection === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      const values: Record<InvitationSortKey, [string | number, string | number]> = {
        name: [a.contact_name, b.contact_name],
        detail: [a.contact_detail, b.contact_detail],
        response: [RESPONSE_LABELS[a.response_status], RESPONSE_LABELS[b.response_status]],
        attendance: [ATTENDANCE_LABELS[a.attendance_status], ATTENDANCE_LABELS[b.attendance_status]],
        flag: [Number(a.attention_flag), Number(b.attention_flag)],
      };
      const [aValue, bValue] = values[sortKey];
      return String(aValue).localeCompare(String(bValue), "it", { numeric: true }) * direction;
    });
  }, [
    attendanceFilter,
    deferredSearch,
    flagFilter,
    invitations,
    responseFilter,
    sortDirection,
    sortKey,
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[#d9e1f2] bg-white p-4 shadow-sm">
        <AddInvitationForm eventId={eventId} contacts={contactOptions} />
      </section>

      <section className="space-y-4">
        <div className="rounded-xl border border-[#d9e1f2] bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-[#1b3272]">Lista invitati</h2>
              <p className="mt-1 text-sm text-slate-600">
                {visibleInvitations.length} di {invitations.length} invitati nella pagina
              </p>
            </div>
            <div className="flex rounded-lg border border-slate-300 bg-white p-1 text-sm font-semibold">
              <button
                type="button"
                onClick={() => changeViewMode("cards")}
                aria-pressed={viewMode === "cards"}
                className={`rounded-md px-3 py-2 ${
                  viewMode === "cards" ? "bg-[#1b3272] text-white" : "text-[#1b3272] hover:bg-slate-50"
                }`}
              >
                Schede
              </button>
              <button
                type="button"
                onClick={() => changeViewMode("table")}
                aria-pressed={viewMode === "table"}
                className={`rounded-md px-3 py-2 ${
                  viewMode === "table" ? "bg-[#1b3272] text-white" : "text-[#1b3272] hover:bg-slate-50"
                }`}
              >
                Tabella
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-4">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cerca nei risultati mostrati"
              aria-label="Cerca negli invitati mostrati"
              className={inputClass}
            />
            <select
              value={responseFilter}
              onChange={(event) => setResponseFilter(event.target.value)}
              aria-label="Filtra per risposta"
              className={inputClass}
            >
              <option value="all">Tutte le risposte</option>
              <option value="no_response">Nessuna risposta</option>
              <option value="attending">Partecipa</option>
              <option value="declined">Non partecipa</option>
              <option value="maybe">Forse</option>
            </select>
            <select
              value={attendanceFilter}
              onChange={(event) => setAttendanceFilter(event.target.value)}
              aria-label="Filtra per presenza"
              className={inputClass}
            >
              <option value="all">Tutte le presenze</option>
              <option value="unknown">Non verificata</option>
              <option value="attended">Presente</option>
              <option value="absent">Assente</option>
            </select>
            <select
              value={flagFilter}
              onChange={(event) => setFlagFilter(event.target.value)}
              aria-label="Filtra per flag"
              className={inputClass}
            >
              <option value="all">Tutti gli invitati</option>
              <option value="flagged">Solo da seguire</option>
              <option value="unflagged">Escludi da seguire</option>
            </select>
          </div>
        </div>

        {visibleInvitations.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-slate-500">
            Nessun invitato corrisponde ai filtri selezionati.
          </p>
        ) : viewMode === "table" ? (
          <InvitationsTable
            invitations={visibleInvitations}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={toggleSort}
            onOpenInvitation={setSelectedInvitation}
            onOpenContact={setSelectedContact}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleInvitations.map((invitation) => (
              <InvitationCard
                key={invitation.id}
                invitation={invitation}
                onOpenInvitation={setSelectedInvitation}
                onOpenContact={setSelectedContact}
              />
            ))}
          </div>
        )}
      </section>

      {selectedInvitation ? (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-950/40 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-label="Dettaglio invito"
          onClick={() => setSelectedInvitation(null)}
        >
          <div
            className={`w-full max-w-3xl overflow-hidden rounded-xl border bg-white shadow-xl ${
              selectedInvitation.attention_flag ? "border-amber-300" : "border-[#d9e1f2]"
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4 ${
              selectedInvitation.attention_flag ? "border-amber-200 bg-amber-50" : "border-slate-200"
            }`}>
              <div>
                <button
                  type="button"
                  onClick={() => setSelectedContact(selectedInvitation.contact)}
                  className="text-left text-xl font-semibold text-[#1b3272] hover:underline"
                >
                  {selectedInvitation.contact_name}
                </button>
                <p className="mt-1 text-sm text-slate-600">
                  {[selectedInvitation.contact_detail, selectedInvitation.contact_email]
                    .filter(Boolean)
                    .join(" · ") || "Dettaglio invito"}
                </p>
                <div className="mt-3">
                  <InvitationBadges invitation={selectedInvitation} />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInvitation(null)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
              >
                Chiudi
              </button>
            </div>
            <div className="px-5 py-5">
              <InvitationEditor invitation={selectedInvitation} />
            </div>
          </div>
        </div>
      ) : null}

      {selectedContact ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-label="Scheda contatto"
          onClick={() => setSelectedContact(null)}
        >
          <div
            className="w-full max-w-5xl overflow-hidden rounded-xl border border-[#d9e1f2] bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-xl font-semibold text-[#1b3272]">
                  {[selectedContact.first_name, selectedContact.last_name].filter(Boolean).join(" ") ||
                    selectedContact.institution ||
                    "Contatto senza nome"}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {[selectedContact.institutional_role, selectedContact.institution, selectedContact.email]
                    .filter(Boolean)
                    .join(" · ") || "Scheda contatto"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedContact(null)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Chiudi
              </button>
            </div>
            <div className="px-5 py-5">
              <ContactEditor
                key={selectedContact.id}
                contact={selectedContact}
                groups={groups}
                references={references}
                languages={languages}
                isManager
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
