"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  addInvitationAction,
  bulkUpdateInvitationStatusAction,
  removeInvitationAction,
  undoBulkInvitationStatusAction,
  updateInvitationAction,
} from "../actions";
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
  row_type: "invitation" | "proposal";
  invitation_status: "pending_approval" | "draft" | "proposed" | "selected" | "invited" | "excluded";
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
  approval_references: string[];
  proposal_ids: number[];
  contact: ContactRecord;
};

type BulkUndoItem = {
  id: number;
  contactId: number;
  rowType: EventInvitationRecord["row_type"];
  status: EventInvitationRecord["invitation_status"];
  proposalIds: number[];
};

type InvitationViewMode = "cards" | "table";
type InvitationSortKey =
  | "name"
  | "detail"
  | "status"
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

const INVITATION_STATUS_LABELS: Record<EventInvitationRecord["invitation_status"], string> = {
  pending_approval: "Da approvare",
  draft: "Bozza",
  proposed: "Proposto",
  selected: "Da invitare",
  invited: "Invitato",
  excluded: "Escluso",
};

function responseLabel(invitation: EventInvitationRecord) {
  return invitation.invitation_status === "invited"
    ? RESPONSE_LABELS[invitation.response_status]
    : "N/A";
}

const ATTENDANCE_LABELS: Record<EventInvitationRecord["attendance_status"], string> = {
  unknown: "Non verificata",
  attended: "Presente",
  absent: "Assente",
};

function normalizeContactSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it");
}

function SearchableContactSelect({
  contacts,
}: {
  contacts: ContactOption[];
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const deferredSearch = useDeferredValue(search);
  const term = normalizeContactSearch(deferredSearch.trim());
  const selectedContact = contacts.find((contact) => contact.id === selectedId);
  const visibleContacts = contacts
    .filter((contact) => {
      if (!term) return true;
      return normalizeContactSearch(`${contact.name} ${contact.detail}`).includes(term);
    })
    .slice(0, 40);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative mt-1.5">
      <input type="hidden" name="contactId" value={selectedId ?? ""} />
      <input
        type="search"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setSelectedId(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={selectedContact ? selectedContact.name : "Cerca nome, istituzione o carica"}
        aria-label="Cerca un contatto da aggiungere"
        role="combobox"
        aria-expanded={open}
        aria-controls="add-invitation-contact-options"
        aria-autocomplete="list"
        autoComplete="off"
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:border-[#d43c2f] focus:outline-none focus:ring-2 focus:ring-[#d43c2f]/20"
      />
      {open ? (
        <div
          id="add-invitation-contact-options"
          role="listbox"
          className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {visibleContacts.length > 0 ? (
            visibleContacts.map((contact) => (
              <button
                key={contact.id}
                type="button"
                role="option"
                aria-selected={contact.id === selectedId}
                onClick={() => {
                  setSelectedId(contact.id);
                  setSearch(contact.name);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-slate-800 hover:bg-[#f5f7fb] focus:bg-[#f5f7fb] focus:outline-none"
              >
                <span className="block font-medium">{contact.name}</span>
                {contact.detail ? (
                  <span className="mt-0.5 block text-xs text-slate-500">{contact.detail}</span>
                ) : null}
              </button>
            ))
          ) : (
            <p className="px-3 py-3 text-sm text-slate-500">Nessun contatto trovato.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

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
        <SearchableContactSelect contacts={contacts} />
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
  const [invitationStatus, setInvitationStatus] = useState(invitation.invitation_status);

  return (
    <div className="space-y-4">
      <form action={action} className="grid gap-3 md:grid-cols-2">
        <input type="hidden" name="invitationId" value={invitation.id} />
        <input type="hidden" name="eventId" value={invitation.event_id} />
        <label className="text-sm font-medium text-slate-700">
          Stato
          <select
            name="invitationStatus"
            value={invitationStatus}
            onChange={(event) =>
              setInvitationStatus(
                event.target.value as Exclude<EventInvitationRecord["invitation_status"], "pending_approval">,
              )
            }
            className={inputClass}
          >
            <option value="draft">Bozza</option>
            <option value="proposed">Proposto</option>
            <option value="selected">Da invitare</option>
            <option value="invited">Invitato</option>
            <option value="excluded">Escluso</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Risposta
          {invitationStatus !== "invited" ? (
            <input type="hidden" name="responseStatus" value="no_response" />
          ) : null}
          <select
            name={invitationStatus === "invited" ? "responseStatus" : undefined}
            defaultValue={invitation.response_status}
            disabled={invitationStatus !== "invited"}
            className={inputClass}
          >
            {invitationStatus !== "invited" ? (
              <option value="no_response">N/A</option>
            ) : (
              <>
                <option value="no_response">Nessuna risposta</option>
                <option value="attending">Partecipa</option>
                <option value="declined">Non partecipa</option>
                <option value="maybe">Forse</option>
              </>
            )}
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
      <span className="rounded-full bg-[#d43c2f]/10 px-2.5 py-1 text-[#b62f24]">
        {INVITATION_STATUS_LABELS[invitation.invitation_status]}
      </span>
      <span className="rounded-full bg-[#1b3272]/10 px-2.5 py-1 text-[#1b3272]">
        {responseLabel(invitation)}
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
  selected,
  onOpenInvitation,
  onOpenContact,
  onToggleInvitation,
}: {
  invitation: EventInvitationRecord;
  selected: boolean;
  onOpenInvitation: (invitation: EventInvitationRecord) => void;
  onOpenContact: (contact: ContactRecord) => void;
  onToggleInvitation: (invitationId: number) => void;
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
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => onOpenContact(invitation.contact)}
            className="text-left font-semibold text-[#1b3272] hover:underline"
          >
            {invitation.contact_name}
          </button>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleInvitation(invitation.id)}
            aria-label={`Seleziona ${invitation.contact_name}`}
            title="Seleziona per modifica massiva"
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#1b3272]"
          />
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-slate-600">
          {[invitation.contact_detail, invitation.contact_email].filter(Boolean).join(" · ") ||
            "Nessun dettaglio"}
        </p>
        {invitation.attention_note ? (
          <p className="mt-2 line-clamp-2 text-xs font-medium text-amber-900">
            {invitation.attention_note}
          </p>
        ) : null}
        {invitation.approval_references.length > 0 ? (
          <p className="mt-2 text-xs font-medium text-slate-600">
            Approvazione: {invitation.approval_references.join(", ")}
          </p>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <InvitationBadges invitation={invitation} />
        <button
          type="button"
          onClick={() =>
            invitation.row_type === "invitation"
              ? onOpenInvitation(invitation)
              : onOpenContact(invitation.contact)
          }
          className="rounded-lg bg-[#1b3272] px-3 py-2 text-sm font-semibold text-white hover:bg-[#263f86]"
        >
          {invitation.row_type === "invitation" ? "Apri invito" : "Apri contatto"}
        </button>
      </div>
    </article>
  );
}

function InvitationsTable({
  invitations,
  selectedInvitationIds,
  sortKey,
  sortDirection,
  onSort,
  onOpenInvitation,
  onOpenContact,
  onToggleInvitation,
  onToggleAll,
}: {
  invitations: EventInvitationRecord[];
  selectedInvitationIds: Set<number>;
  sortKey: InvitationSortKey;
  sortDirection: SortDirection;
  onSort: (key: InvitationSortKey) => void;
  onOpenInvitation: (invitation: EventInvitationRecord) => void;
  onOpenContact: (contact: ContactRecord) => void;
  onToggleInvitation: (invitationId: number) => void;
  onToggleAll: () => void;
}) {
  const selectableInvitations = invitations;
  const allSelected =
    selectableInvitations.length > 0 &&
    selectableInvitations.every((invitation) => selectedInvitationIds.has(invitation.id));

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
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  disabled={selectableInvitations.length === 0}
                  aria-label="Seleziona tutti gli inviti mostrati"
                  className="h-4 w-4 accent-[#1b3272]"
                />
              </th>
              <th className="px-4 py-3">{header("name", "Contatto")}</th>
              <th className="px-4 py-3">{header("detail", "Carica / Istituzione")}</th>
              <th className="px-4 py-3">{header("status", "Stato")}</th>
              <th className="px-4 py-3">Approvazione richiesta a</th>
              <th className="px-4 py-3">{header("response", "Risposta")}</th>
              <th className="px-4 py-3">{header("attendance", "Presenza")}</th>
              <th className="px-4 py-3">{header("flag", "Da seguire")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invitations.map((invitation) => (
              <tr
                key={invitation.id}
                onClick={() =>
                  invitation.row_type === "invitation"
                    ? onOpenInvitation(invitation)
                    : onOpenContact(invitation.contact)
                }
                className={`cursor-pointer hover:bg-slate-50 ${
                  invitation.attention_flag ? "bg-amber-50/60" : "bg-white"
                }`}
              >
                <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedInvitationIds.has(invitation.id)}
                    onChange={() => onToggleInvitation(invitation.id)}
                    aria-label={`Seleziona ${invitation.contact_name}`}
                    title="Seleziona per modifica massiva"
                    className="h-4 w-4 accent-[#1b3272]"
                  />
                </td>
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
                <td className="px-4 py-3 text-slate-700">
                  {INVITATION_STATUS_LABELS[invitation.invitation_status]}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {invitation.approval_references.join(", ") || "—"}
                </td>
                <td className="px-4 py-3 text-slate-700">{responseLabel(invitation)}</td>
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
  pageSearch,
  invitations,
  contactOptions,
  groups,
  references,
  languages,
}: {
  eventId: number;
  pageSearch: string;
  invitations: EventInvitationRecord[];
  contactOptions: ContactOption[];
  groups: Option[];
  references: Option[];
  languages: LanguageOption[];
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [responseFilter, setResponseFilter] = useState("all");
  const [attendanceFilter, setAttendanceFilter] = useState("all");
  const [flagFilter, setFlagFilter] = useState("all");
  const [sortKey, setSortKey] = useState<InvitationSortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedInvitation, setSelectedInvitation] = useState<EventInvitationRecord | null>(null);
  const [selectedContact, setSelectedContact] = useState<ContactRecord | null>(null);
  const [selectedInvitationIds, setSelectedInvitationIds] = useState<Set<number>>(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [pendingUndo, setPendingUndo] = useState<BulkUndoItem[]>([]);
  const [undoPayload, setUndoPayload] = useState<BulkUndoItem[]>([]);
  const [bulkState, bulkAction, bulkPending] = useArchiveAction(bulkUpdateInvitationStatusAction);
  const [undoState, undoAction, undoPending] = useArchiveAction(undoBulkInvitationStatusAction);
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

  function toggleInvitation(invitationId: number) {
    const invitation = invitations.find((item) => item.id === invitationId);
    if (!invitation) return;
    setSelectedInvitationIds((current) => {
      const next = new Set(current);
      if (next.has(invitationId)) next.delete(invitationId);
      else next.add(invitationId);
      return next;
    });
  }

  function toggleAllVisible() {
    const selectable = visibleInvitations;
    const allSelected =
      selectable.length > 0 &&
      selectable.every((invitation) => selectedInvitationIds.has(invitation.id));
    setSelectedInvitationIds((current) => {
      const next = new Set(current);
      for (const invitation of selectable) {
        if (allSelected) next.delete(invitation.id);
        else next.add(invitation.id);
      }
      return next;
    });
  }

  useEffect(() => {
    if (bulkState.status === "error") {
      const timeout = window.setTimeout(() => setPendingUndo([]), 0);
      return () => window.clearTimeout(timeout);
    }
    if (bulkState.status !== "success" || pendingUndo.length === 0) return;
    const timeout = window.setTimeout(() => {
      setUndoPayload(pendingUndo);
      setPendingUndo([]);
      setSelectedInvitationIds(new Set());
      setBulkModalOpen(false);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [bulkState.status, pendingUndo]);

  useEffect(() => {
    if (undoState.status !== "success") return;
    const timeout = window.setTimeout(() => setUndoPayload([]), 0);
    return () => window.clearTimeout(timeout);
  }, [undoState.status]);

  const visibleInvitations = (() => {
    const term = deferredSearch.trim().toLowerCase();
    const filtered = invitations.filter((invitation) => {
      const haystack = [
        invitation.contact_name,
        invitation.contact_detail,
        invitation.contact_email,
        invitation.attention_note,
        invitation.notes,
        invitation.approval_references.join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        (!term || haystack.includes(term)) &&
        (statusFilter === "all" || invitation.invitation_status === statusFilter) &&
        (responseFilter === "all" ||
          (responseFilter === "not_applicable"
            ? invitation.invitation_status !== "invited"
            : invitation.invitation_status === "invited" &&
              invitation.response_status === responseFilter)) &&
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
        status: [
          INVITATION_STATUS_LABELS[a.invitation_status],
          INVITATION_STATUS_LABELS[b.invitation_status],
        ],
        response: [responseLabel(a), responseLabel(b)],
        attendance: [ATTENDANCE_LABELS[a.attendance_status], ATTENDANCE_LABELS[b.attendance_status]],
        flag: [Number(a.attention_flag), Number(b.attention_flag)],
      };
      const [aValue, bValue] = values[sortKey];
      return String(aValue).localeCompare(String(bValue), "it", { numeric: true }) * direction;
    });
  })();

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <section className="rounded-xl border border-[#d9e1f2] bg-white p-4 shadow-sm">
          <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="text-sm font-medium text-slate-700">
              Cerca tra gli invitati
              <input
                name="q"
                type="search"
                defaultValue={pageSearch}
                placeholder="Nome, istituzione, carica o email"
                className={inputClass}
              />
            </label>
            <button className="rounded-xl bg-[#1b3272] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#263f86]">
              Filtra
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-[#d9e1f2] bg-white p-4 shadow-sm">
          <AddInvitationForm eventId={eventId} contacts={contactOptions} />
        </section>

        <Link
          href={`/dashboard/events/${eventId}/build`}
          className="inline-flex items-center justify-center self-end rounded-xl bg-[#d43c2f] px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-[#bb3025] md:col-span-2 lg:col-span-1"
        >
          Costruisci lista con filtri
        </Link>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#d9e1f2] bg-white p-4 shadow-sm">
          <button
            type="button"
            disabled={selectedInvitationIds.size === 0}
            onClick={() => setBulkModalOpen(true)}
            className="rounded-xl bg-[#1b3272] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#263f86] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cambia stato ({selectedInvitationIds.size})
          </button>
          {undoPayload.length > 0 ? (
            <form action={undoAction}>
              <input type="hidden" name="eventId" value={eventId} />
              <input type="hidden" name="previousStates" value={JSON.stringify(undoPayload)} />
              <button
                type="submit"
                disabled={undoPending}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
              >
                {undoPending ? <PendingSpinner /> : null}
                Annulla ultima modifica massiva
              </button>
            </form>
          ) : null}
          <span className="text-sm text-slate-600">
            Le proposte possono essere convertite direttamente in “Da invitare” quando
            l’approvazione arriva fuori dall’app.
          </span>
          <div className="basis-full">
            <div className="space-y-2">
              <ActionMessage state={bulkState} />
              <ActionMessage state={undoState} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[#d9e1f2] bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-[#1b3272]">Lista evento</h2>
              <p className="mt-1 text-sm text-slate-600">
                {visibleInvitations.length} di {invitations.length} contatti nella pagina
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
          <div className="mt-4 grid gap-2 md:grid-cols-5">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cerca nei risultati mostrati"
              aria-label="Cerca negli invitati mostrati"
              className={inputClass}
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filtra per stato invito"
              className={inputClass}
            >
              <option value="all">Tutti gli stati</option>
              <option value="pending_approval">Da approvare</option>
              <option value="draft">Bozza</option>
              <option value="proposed">Proposto</option>
              <option value="selected">Da invitare</option>
              <option value="invited">Invitato</option>
              <option value="excluded">Escluso</option>
            </select>
            <select
              value={responseFilter}
              onChange={(event) => setResponseFilter(event.target.value)}
              aria-label="Filtra per risposta"
              className={inputClass}
            >
              <option value="all">Tutte le risposte</option>
              <option value="not_applicable">N/A</option>
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
              <option value="all">Tutti i contatti</option>
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
            selectedInvitationIds={selectedInvitationIds}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={toggleSort}
            onOpenInvitation={setSelectedInvitation}
            onOpenContact={setSelectedContact}
            onToggleInvitation={toggleInvitation}
            onToggleAll={toggleAllVisible}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleInvitations.map((invitation) => (
              <InvitationCard
                key={invitation.id}
                invitation={invitation}
                selected={selectedInvitationIds.has(invitation.id)}
                onOpenInvitation={setSelectedInvitation}
                onOpenContact={setSelectedContact}
                onToggleInvitation={toggleInvitation}
              />
            ))}
          </div>
        )}
      </section>

      {bulkModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-label="Modifica massiva stato"
          onClick={() => setBulkModalOpen(false)}
        >
          <form
            action={bulkAction}
            onSubmit={() => {
              setPendingUndo(
                invitations
                  .filter((invitation) => selectedInvitationIds.has(invitation.id))
                  .map((invitation) => ({
                    id: invitation.id,
                    contactId: invitation.contact_id,
                    rowType: invitation.row_type,
                    status: invitation.invitation_status,
                    proposalIds: invitation.proposal_ids,
                  })),
              );
            }}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-lg space-y-4 rounded-2xl border border-[#d9e1f2] bg-white p-5 shadow-xl"
          >
            <input type="hidden" name="eventId" value={eventId} />
            {invitations
              .filter(
                (invitation) =>
                  selectedInvitationIds.has(invitation.id) &&
                  invitation.row_type === "invitation",
              )
              .map((invitation) => (
                <input
                  key={invitation.id}
                  type="hidden"
                  name="invitationIds"
                  value={invitation.id}
                />
              ))}
            {invitations
              .filter(
                (invitation) =>
                  selectedInvitationIds.has(invitation.id) &&
                  invitation.row_type === "proposal",
              )
              .map((invitation) => (
                <input
                  key={invitation.id}
                  type="hidden"
                  name="proposalContactIds"
                  value={invitation.contact_id}
                />
              ))}
            <div>
              <h2 className="text-xl font-semibold text-[#1b3272]">Cambia stato</h2>
              <p className="mt-1 text-sm text-slate-600">
                Imposta lo stesso stato per {selectedInvitationIds.size}{" "}
                {selectedInvitationIds.size === 1 ? "contatto selezionato" : "contatti selezionati"}.
              </p>
            </div>
            <label className="text-sm font-medium text-slate-700">
              Nuovo stato
              <select name="invitationStatus" defaultValue="selected" className={inputClass}>
                <option value="draft">Bozza</option>
                <option value="proposed">Proposto</option>
                <option value="selected">Da invitare</option>
                <option value="invited">Invitato</option>
                <option value="excluded">Escluso</option>
              </select>
            </label>
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setBulkModalOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700"
              >
                Annulla
              </button>
              <SubmitButton pending={bulkPending}>Applica stato</SubmitButton>
            </div>
          </form>
        </div>
      ) : null}

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
