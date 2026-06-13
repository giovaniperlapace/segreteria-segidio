"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  addInvitationAction,
  bulkUpdateInvitationResponseAction,
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
  response_note: string | null;
  companion_count: number;
  companion_names: string | null;
  invited_at: string | null;
  response_recorded_at: string | null;
  response_recorded_by_profile_id: string | null;
  response_recorded_by_name: string | null;
  invitation_status_updated_at: string | null;
  invitation_status_updated_by_profile_id: string | null;
  invitation_status_updated_by_name: string | null;
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
  responseStatus: EventInvitationRecord["response_status"];
  attendanceStatus: EventInvitationRecord["attendance_status"];
  responseNote: string | null;
  companionCount: number;
  companionNames: string | null;
  invitedAt: string | null;
  responseRecordedAt: string | null;
  responseRecordedByProfileId: string | null;
};

type InvitationSummary = {
  total: number;
  pendingApproval: number;
  selected: number;
  invited: number;
  noResponse: number;
  attending: number;
  declined: number;
  maybe: number;
};

type InvitationViewMode = "cards" | "table";
type InvitationSortKey =
  | "firstName"
  | "lastName"
  | "role"
  | "status"
  | "response"
  | "attendance"
  | "flag";
type SortDirection = "asc" | "desc";
type InvitationTableColumnKey = "status" | "approval" | "response" | "attendance" | "flag";

const INVITATION_TABLE_COLUMN_KEYS: InvitationTableColumnKey[] = [
  "status",
  "approval",
  "response",
  "attendance",
  "flag",
];

function readHiddenInvitationColumns(storageKey: string) {
  if (typeof window === "undefined") return new Set<InvitationTableColumnKey>();

  const rawValue = window.localStorage.getItem(storageKey);
  if (!rawValue) return new Set<InvitationTableColumnKey>();

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return new Set<InvitationTableColumnKey>();

    const allowed = new Set(INVITATION_TABLE_COLUMN_KEYS);
    return new Set(
      parsed.filter((key): key is InvitationTableColumnKey => allowed.has(key)),
    );
  } catch {
    window.localStorage.removeItem(storageKey);
    return new Set<InvitationTableColumnKey>();
  }
}

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

function formatOperationalDate(value: string | null) {
  if (!value) return "Non registrata";
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

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
  const router = useRouter();
  const [state, action, pending] = useArchiveAction(updateInvitationAction);
  const [deleteState, deleteAction, deletePending] = useArchiveAction(removeInvitationAction);
  const [invitationStatus, setInvitationStatus] = useState(invitation.invitation_status);
  const [responseStatus, setResponseStatus] = useState(invitation.response_status);
  const [companionCount, setCompanionCount] = useState(invitation.companion_count);
  const canEditResponse = invitationStatus === "invited";
  const canEditCompanions = canEditResponse && responseStatus === "attending";

  useEffect(() => {
    if (state.status !== "success") return;
    router.refresh();
  }, [router, state.status]);

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
          {!canEditResponse ? (
            <input type="hidden" name="responseStatus" value="no_response" />
          ) : null}
          <select
            name={canEditResponse ? "responseStatus" : undefined}
            value={canEditResponse ? responseStatus : "no_response"}
            onChange={(event) =>
              setResponseStatus(event.target.value as EventInvitationRecord["response_status"])
            }
            disabled={!canEditResponse}
            className={inputClass}
          >
            {!canEditResponse ? (
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
          Accompagnatori
          <input
            name="companionCount"
            type="number"
            min={0}
            max={20}
            step={1}
            value={canEditCompanions ? companionCount : 0}
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              setCompanionCount(
                Number.isSafeInteger(nextValue) && nextValue > 0 ? nextValue : 0,
              );
            }}
            disabled={!canEditCompanions}
            className={inputClass}
          />
        </label>
        {canEditCompanions && companionCount > 0 ? (
          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Nomi accompagnatori
            <textarea
              name="companionNames"
              rows={2}
              defaultValue={invitation.companion_names ?? ""}
              placeholder="Es. Mario Rossi, Anna Bianchi"
              className={inputClass}
            />
          </label>
        ) : null}
        <label className="text-sm font-medium text-slate-700 md:col-span-2">
          Nota risposta
          <textarea
            name="responseNote"
            rows={2}
            defaultValue={invitation.response_note ?? ""}
            disabled={!canEditResponse}
            placeholder="Es. conferma ricevuta telefonicamente"
            className={inputClass}
          />
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
        <dl className="grid gap-3 rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-600 md:col-span-2 sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-slate-700">Ultima variazione stato</dt>
            <dd className="mt-1">
              {formatOperationalDate(invitation.invitation_status_updated_at)}
              {invitation.invitation_status_updated_by_name
                ? ` · ${invitation.invitation_status_updated_by_name}`
                : ""}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-700">Risposta registrata</dt>
            <dd className="mt-1">
              {formatOperationalDate(invitation.response_recorded_at)}
              {invitation.response_recorded_by_name
                ? ` · ${invitation.response_recorded_by_name}`
                : ""}
            </dd>
          </div>
        </dl>
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
  const hasRecordedResponse =
    invitation.invitation_status === "invited" &&
    invitation.response_status !== "no_response";
  const responseBadgeClass =
    invitation.response_status === "attending"
      ? "bg-emerald-100 text-emerald-800"
      : "bg-[#1b3272]/10 text-[#1b3272]";
  const participantCount = 1 + Math.max(invitation.companion_count, 0);

  return (
    <div className="flex flex-wrap gap-2 text-xs font-semibold">
      {hasRecordedResponse ? null : (
        <span className="rounded-full bg-[#d43c2f]/10 px-2.5 py-1 text-[#b62f24]">
          {INVITATION_STATUS_LABELS[invitation.invitation_status]}
        </span>
      )}
      <span className={`rounded-full px-2.5 py-1 ${responseBadgeClass}`}>
        {responseLabel(invitation)}
      </span>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
        {ATTENDANCE_LABELS[invitation.attendance_status]}
      </span>
      {invitation.attention_flag ? (
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">Da seguire</span>
      ) : null}
      {invitation.response_status === "attending" && invitation.companion_count > 0 ? (
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">
          {participantCount} partecipanti
        </span>
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
        {invitation.response_note ? (
          <div className="mt-3 border-l-2 border-emerald-300 pl-3">
            <div className="text-[11px] font-semibold uppercase text-slate-500">
              Nota risposta
            </div>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-5 text-slate-700">
              {invitation.response_note}
            </p>
          </div>
        ) : null}
        {invitation.response_status === "attending" && invitation.companion_count > 0 ? (
          <div className="mt-3 border-l-2 border-[#1b3272]/30 pl-3">
            <div className="text-[11px] font-semibold uppercase text-slate-500">
              Accompagnatori
            </div>
            <p className="mt-0.5 text-sm leading-5 text-slate-700">
              {invitation.companion_count}{" "}
              {invitation.companion_count === 1 ? "accompagnatore" : "accompagnatori"}
            </p>
            {invitation.companion_names ? (
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-slate-600">
                {invitation.companion_names}
              </p>
            ) : null}
          </div>
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
  hiddenColumnKeys,
  onSort,
  onHideColumn,
  onShowAllColumns,
  onOpenInvitation,
  onOpenContact,
  onToggleInvitation,
  onToggleAll,
}: {
  invitations: EventInvitationRecord[];
  selectedInvitationIds: Set<number>;
  sortKey: InvitationSortKey;
  sortDirection: SortDirection;
  hiddenColumnKeys: Set<InvitationTableColumnKey>;
  onSort: (key: InvitationSortKey) => void;
  onHideColumn: (key: InvitationTableColumnKey) => void;
  onShowAllColumns: () => void;
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
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-pending-feedback="off"
          onClick={() => onSort(key)}
          className="font-semibold text-[#1b3272] hover:text-[#d43c2f]"
        >
          {label}{arrow}
        </button>
        <button
          type="button"
          data-pending-feedback="off"
          onClick={(event) => {
            event.stopPropagation();
            onHideColumn(key as InvitationTableColumnKey);
          }}
          title={`Nascondi ${label}`}
          aria-label={`Nascondi colonna ${label}`}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-bold text-slate-500 hover:border-[#d43c2f] hover:text-[#d43c2f]"
        >
          ×
        </button>
      </div>
    );
  }

  function plainHeader(key: InvitationTableColumnKey, label: string) {
    return (
      <div className="flex items-center gap-2">
        <span className="font-semibold text-slate-600">{label}</span>
        <button
          type="button"
          data-pending-feedback="off"
          onClick={(event) => {
            event.stopPropagation();
            onHideColumn(key);
          }}
          title={`Nascondi ${label}`}
          aria-label={`Nascondi colonna ${label}`}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-bold text-slate-500 hover:border-[#d43c2f] hover:text-[#d43c2f]"
        >
          ×
        </button>
      </div>
    );
  }

  function contactHeader() {
    const sortOptions: { key: InvitationSortKey; label: string }[] = [
      { key: "firstName", label: "Nome" },
      { key: "lastName", label: "Cognome" },
      { key: "role", label: "Carica" },
    ];

    return (
      <div className="min-w-56 space-y-1">
        <div className="font-semibold text-[#1b3272]">Contatto</div>
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 normal-case shadow-sm">
          {sortOptions.map((option) => {
            const active = sortKey === option.key;
            return (
              <button
                key={option.key}
                type="button"
                data-pending-feedback="off"
                onClick={() => onSort(option.key)}
                aria-pressed={active}
                aria-label={`Ordina per ${option.label.toLowerCase()}`}
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition ${
                  active
                    ? "border-[#1b3272] bg-[#eef4ff] text-[#1b3272]"
                    : "border-transparent text-[#1b3272] hover:bg-[#1b3272]/10"
                }`}
              >
                {option.label}
                {active ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#d9e1f2] bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs font-medium text-slate-600">
          {hiddenColumnKeys.size > 0
            ? `${hiddenColumnKeys.size} ${
                hiddenColumnKeys.size === 1 ? "colonna nascosta" : "colonne nascoste"
              }`
            : "Tutte le colonne sono visibili"}
        </p>
        <button
          type="button"
          data-pending-feedback="off"
          onClick={onShowAllColumns}
          disabled={hiddenColumnKeys.size === 0}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-[#1b3272] hover:border-[#d43c2f] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Mostra tutte le colonne
        </button>
      </div>
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
              <th className="px-4 py-3">{contactHeader()}</th>
              {hiddenColumnKeys.has("status") ? null : (
                <th className="px-4 py-3">{header("status", "Stato")}</th>
              )}
              {hiddenColumnKeys.has("approval") ? null : (
                <th className="px-4 py-3">{plainHeader("approval", "Approvazione richiesta a")}</th>
              )}
              {hiddenColumnKeys.has("response") ? null : (
                <th className="px-4 py-3">{header("response", "Risposta")}</th>
              )}
              {hiddenColumnKeys.has("attendance") ? null : (
                <th className="px-4 py-3">{header("attendance", "Presenza")}</th>
              )}
              {hiddenColumnKeys.has("flag") ? null : (
                <th className="px-4 py-3">{header("flag", "Da seguire")}</th>
              )}
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
                  {invitation.contact_detail ? (
                    <div className="mt-1 max-w-xl text-xs leading-5 text-slate-600">
                      {invitation.contact_detail}
                    </div>
                  ) : null}
                </td>
                {hiddenColumnKeys.has("status") ? null : (
                  <td className="px-4 py-3 text-slate-700">
                    {INVITATION_STATUS_LABELS[invitation.invitation_status]}
                  </td>
                )}
                {hiddenColumnKeys.has("approval") ? null : (
                  <td className="px-4 py-3 text-slate-700">
                    {invitation.approval_references.join(", ") || "—"}
                  </td>
                )}
                {hiddenColumnKeys.has("response") ? null : (
                  <td className="px-4 py-3 text-slate-700">
                    <div>{responseLabel(invitation)}</div>
                    {invitation.response_status === "attending" && invitation.companion_count > 0 ? (
                      <div className="mt-1 text-xs font-semibold text-emerald-800">
                        {1 + invitation.companion_count} partecipanti
                      </div>
                    ) : null}
                    {invitation.response_note ? (
                      <div className="mt-1 max-w-64 whitespace-pre-wrap break-words text-xs leading-5 text-slate-500">
                        {invitation.response_note}
                      </div>
                    ) : null}
                    {invitation.companion_names ? (
                      <div className="mt-1 max-w-64 whitespace-pre-wrap break-words text-xs leading-5 text-slate-500">
                        Accompagnatori: {invitation.companion_names}
                      </div>
                    ) : null}
                  </td>
                )}
                {hiddenColumnKeys.has("attendance") ? null : (
                  <td className="px-4 py-3 text-slate-700">
                    {ATTENDANCE_LABELS[invitation.attendance_status]}
                  </td>
                )}
                {hiddenColumnKeys.has("flag") ? null : (
                  <td className="px-4 py-3 text-slate-700">
                    {invitation.attention_flag ? invitation.attention_note || "Sì" : "No"}
                  </td>
                )}
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
  summary,
  contactOptions,
  groups,
  references,
  languages,
}: {
  eventId: number;
  pageSearch: string;
  invitations: EventInvitationRecord[];
  summary: InvitationSummary;
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
  const [sortKey, setSortKey] = useState<InvitationSortKey>("lastName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedInvitationId, setSelectedInvitationId] = useState<number | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [selectedInvitationIds, setSelectedInvitationIds] = useState<Set<number>>(new Set());
  const [contactOverrides, setContactOverrides] = useState<Map<number, ContactRecord>>(new Map());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkResponseModalOpen, setBulkResponseModalOpen] = useState(false);
  const [pendingUndo, setPendingUndo] = useState<BulkUndoItem[]>([]);
  const [undoPayload, setUndoPayload] = useState<BulkUndoItem[]>([]);
  const [bulkState, bulkAction, bulkPending] = useArchiveAction(bulkUpdateInvitationStatusAction);
  const [bulkResponseState, bulkResponseAction, bulkResponsePending] = useArchiveAction(
    bulkUpdateInvitationResponseAction,
  );
  const [undoState, undoAction, undoPending] = useArchiveAction(undoBulkInvitationStatusAction);
  const deferredSearch = useDeferredValue(search);
  const viewPreferenceKey = `event-invitations-view:${eventId}`;
  const tableColumnsPreferenceKey = `${viewPreferenceKey}:table-columns:hidden`;
  const [hiddenTableColumns, setHiddenTableColumns] = useState<
    Set<InvitationTableColumnKey>
  >(() => readHiddenInvitationColumns(tableColumnsPreferenceKey));
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

  function storeHiddenTableColumns(nextHiddenColumns: Set<InvitationTableColumnKey>) {
    window.localStorage.setItem(
      tableColumnsPreferenceKey,
      JSON.stringify([...nextHiddenColumns]),
    );
  }

  function hideTableColumn(columnKey: InvitationTableColumnKey) {
    setHiddenTableColumns((current) => {
      const next = new Set(current).add(columnKey);
      storeHiddenTableColumns(next);
      return next;
    });

    if (sortKey === columnKey) {
      setSortKey("lastName");
      setSortDirection("asc");
    }
  }

  function showAllTableColumns() {
    const next = new Set<InvitationTableColumnKey>();
    setHiddenTableColumns(next);
    storeHiddenTableColumns(next);
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

  const selectedInvitation = useMemo(() => {
    if (!selectedInvitationId) return null;
    return invitations.find((invitation) => invitation.id === selectedInvitationId) ?? null;
  }, [invitations, selectedInvitationId]);

  const selectedContact = useMemo(() => {
    if (!selectedContactId) return null;
    const overriddenContact = contactOverrides.get(selectedContactId);
    if (overriddenContact) return overriddenContact;
    return invitations.find((invitation) => invitation.contact_id === selectedContactId)?.contact ?? null;
  }, [contactOverrides, invitations, selectedContactId]);

  const updateSelectedContact = useCallback((updatedContact: ContactRecord) => {
    setContactOverrides((current) => {
      const next = new Map(current);
      next.set(updatedContact.id, updatedContact);
      return next;
    });
  }, []);

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
    if (bulkState.status === "error" || bulkResponseState.status === "error") {
      const timeout = window.setTimeout(() => setPendingUndo([]), 0);
      return () => window.clearTimeout(timeout);
    }
    if (
      bulkState.status !== "success" &&
      bulkResponseState.status !== "success"
    ) return;
    if (pendingUndo.length === 0) return;
    const timeout = window.setTimeout(() => {
      setUndoPayload(pendingUndo);
      setPendingUndo([]);
      setSelectedInvitationIds(new Set());
      setBulkModalOpen(false);
      setBulkResponseModalOpen(false);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [bulkResponseState.status, bulkState.status, pendingUndo]);

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
        invitation.response_note,
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
        firstName: [a.contact.first_name ?? "", b.contact.first_name ?? ""],
        lastName: [a.contact.last_name ?? "", b.contact.last_name ?? ""],
        role: [
          a.contact.institutional_role ?? a.contact.institution ?? "",
          b.contact.institutional_role ?? b.contact.institution ?? "",
        ],
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
  const selectedInvitedRows = invitations.filter(
    (invitation) =>
      selectedInvitationIds.has(invitation.id) &&
      invitation.row_type === "invitation" &&
      invitation.invitation_status === "invited",
  );

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8" aria-label="Riepilogo inviti e risposte">
        {[
          ["Totale lista", summary.total],
          ["Da approvare", summary.pendingApproval],
          ["Da invitare", summary.selected],
          ["Invitati", summary.invited],
          ["Partecipa", summary.attending],
          ["Non partecipa", summary.declined],
          ["Forse", summary.maybe],
          ["Nessuna risposta", summary.noResponse],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-lg border border-[#d9e1f2] bg-white px-3 py-3 shadow-sm">
            <div className="text-2xl font-semibold text-[#1b3272]">{value}</div>
            <div className="mt-1 text-xs font-medium text-slate-600">{label}</div>
          </div>
        ))}
      </section>

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
          <button
            type="button"
            disabled={selectedInvitedRows.length === 0}
            onClick={() => setBulkResponseModalOpen(true)}
            className="rounded-xl border border-[#1b3272] bg-white px-4 py-2.5 text-sm font-semibold text-[#1b3272] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Registra risposta ({selectedInvitedRows.length})
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
              <ActionMessage state={bulkResponseState} />
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
            hiddenColumnKeys={hiddenTableColumns}
            onSort={toggleSort}
            onHideColumn={hideTableColumn}
            onShowAllColumns={showAllTableColumns}
            onOpenInvitation={(invitation) => setSelectedInvitationId(invitation.id)}
            onOpenContact={(contact) => setSelectedContactId(contact.id)}
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
                onOpenInvitation={(item) => setSelectedInvitationId(item.id)}
                onOpenContact={(contact) => setSelectedContactId(contact.id)}
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
                    responseStatus: invitation.response_status,
                    attendanceStatus: invitation.attendance_status,
                    responseNote: invitation.response_note,
                    companionCount: invitation.companion_count,
                    companionNames: invitation.companion_names,
                    invitedAt: invitation.invited_at,
                    responseRecordedAt: invitation.response_recorded_at,
                    responseRecordedByProfileId: invitation.response_recorded_by_profile_id,
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

      {bulkResponseModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-label="Registra risposta massiva"
          onClick={() => setBulkResponseModalOpen(false)}
        >
          <form
            action={bulkResponseAction}
            onSubmit={() => {
              setPendingUndo(
                selectedInvitedRows.map((invitation) => ({
                  id: invitation.id,
                  contactId: invitation.contact_id,
                  rowType: invitation.row_type,
                  status: invitation.invitation_status,
                  proposalIds: invitation.proposal_ids,
                  responseStatus: invitation.response_status,
                  attendanceStatus: invitation.attendance_status,
                  responseNote: invitation.response_note,
                  companionCount: invitation.companion_count,
                  companionNames: invitation.companion_names,
                  invitedAt: invitation.invited_at,
                  responseRecordedAt: invitation.response_recorded_at,
                  responseRecordedByProfileId: invitation.response_recorded_by_profile_id,
                })),
              );
            }}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-lg space-y-4 rounded-xl border border-[#d9e1f2] bg-white p-5 shadow-xl"
          >
            <input type="hidden" name="eventId" value={eventId} />
            {selectedInvitedRows.map((invitation) => (
              <input
                key={invitation.id}
                type="hidden"
                name="invitationIds"
                value={invitation.id}
              />
            ))}
            <div>
              <h2 className="text-xl font-semibold text-[#1b3272]">Registra risposta</h2>
              <p className="mt-1 text-sm text-slate-600">
                La risposta sarà applicata a {selectedInvitedRows.length}{" "}
                {selectedInvitedRows.length === 1 ? "invitato" : "invitati"}.
              </p>
            </div>
            <label className="text-sm font-medium text-slate-700">
              Risposta
              <select name="responseStatus" defaultValue="attending" className={inputClass}>
                <option value="no_response">Nessuna risposta</option>
                <option value="attending">Partecipa</option>
                <option value="declined">Non partecipa</option>
                <option value="maybe">Forse</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Nota risposta
              <textarea
                name="responseNote"
                rows={3}
                placeholder="Es. conferma ricevuta telefonicamente"
                className={inputClass}
              />
            </label>
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setBulkResponseModalOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700"
              >
                Annulla
              </button>
              <SubmitButton pending={bulkResponsePending}>Applica risposta</SubmitButton>
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
          onClick={() => setSelectedInvitationId(null)}
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
                  onClick={() => setSelectedContactId(selectedInvitation.contact_id)}
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
                onClick={() => setSelectedInvitationId(null)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
              >
                Chiudi
              </button>
            </div>
            <div className="px-5 py-5">
              <InvitationEditor
                key={`${selectedInvitation.id}:${selectedInvitation.invitation_status}:${selectedInvitation.response_status}:${selectedInvitation.attendance_status}:${selectedInvitation.attention_flag}:${selectedInvitation.attention_note ?? ""}:${selectedInvitation.response_note ?? ""}:${selectedInvitation.companion_count}:${selectedInvitation.companion_names ?? ""}:${selectedInvitation.notes ?? ""}`}
                invitation={selectedInvitation}
              />
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
          onClick={() => setSelectedContactId(null)}
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
                onClick={() => setSelectedContactId(null)}
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
                onContactUpdated={updateSelectedContact}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
