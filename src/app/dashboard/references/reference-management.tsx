"use client";

import { useDeferredValue, useMemo, useState } from "react";
import {
  convertReferenceToUserAction,
  createReferenceAction,
  deleteReferenceAction,
  updateReferenceAction,
} from "../archive-actions";
import { ActionMessage, inputClass, SubmitButton, useArchiveAction } from "../archive-ui";
import {
  ContactEditor,
  type ContactRecord,
  type LanguageOption,
  type Option,
} from "../contacts/contact-management";

type Reference = {
  id: number;
  first_name: string;
  last_name: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  active: boolean;
  linked_profile: boolean;
  contact_count: number;
  contacts: AssociatedContact[];
};

type AssociatedContact = ContactRecord;

type SortKey = "first_name" | "last_name" | "email" | "phone" | "contact_count" | "active" | "linked_profile";
type SortDirection = "asc" | "desc";

function CreateReferenceForm() {
  const [state, action, pending] = useArchiveAction(createReferenceAction);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">
          Nome
          <input required name="firstName" className={inputClass} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Cognome
          <input name="lastName" className={inputClass} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Email
          <input name="email" type="email" className={inputClass} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Telefono
          <input name="phone" type="tel" className={inputClass} />
        </label>
        <label className="text-sm font-medium text-slate-700 md:col-span-4">
          Note
          <input name="notes" className={inputClass} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending}>Crea referente</SubmitButton>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

function ReferenceRow({
  reference,
  isOpen,
  onToggle,
  onOpenContact,
}: {
  reference: Reference;
  isOpen: boolean;
  onToggle: () => void;
  onOpenContact: (contact: ContactRecord) => void;
}) {
  const [state, action, pending] = useArchiveAction(updateReferenceAction);
  const [convertState, convertAction, convertPending] = useArchiveAction(convertReferenceToUserAction);
  const [deleteState, deleteAction, deletePending] = useArchiveAction(deleteReferenceAction);
  const [showAllContacts, setShowAllContacts] = useState(false);
  const formId = `reference-${reference.id}`;
  const visibleContacts = showAllContacts ? reference.contacts : reference.contacts.slice(0, 50);
  const accountLabel = reference.linked_profile ? "Collegato" : "Non collegato";

  return (
    <>
      <tr
        className={`cursor-pointer border-t border-slate-200 align-top hover:bg-[#f8fafc] ${
          isOpen ? "bg-[#f8fafc]" : ""
        }`}
        onClick={onToggle}
      >
        <td className="px-3 py-3 font-semibold text-[#1b3272]">
          <button
            type="button"
            className="text-left hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            {reference.first_name}
          </button>
        </td>
        <td className="px-3 py-3 text-slate-700">{reference.last_name || "—"}</td>
        <td className="max-w-0 truncate px-3 py-3 text-slate-700" title={reference.email ?? undefined}>
          {reference.email || "—"}
        </td>
        <td className="px-3 py-3 text-slate-700">
          <span className="line-clamp-2">{reference.notes || "—"}</span>
        </td>
        <td className="px-3 py-3 text-sm text-slate-700">{reference.contact_count}</td>
        <td className="px-3 py-3">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              reference.linked_profile
                ? "bg-emerald-100 text-emerald-800"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {accountLabel}
          </span>
        </td>
        <td className="px-3 py-3 text-slate-700">{reference.active ? "Attivo" : "Disattivato"}</td>
        <td className="px-3 py-3 text-right">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            className="whitespace-nowrap text-sm font-semibold text-[#d43c2f] hover:underline"
          >
            {isOpen ? "Chiudi" : "Apri"}
          </button>
        </td>
      </tr>
      {isOpen ? (
        <tr className="border-t border-slate-100 bg-[#fbfcff]">
          <td colSpan={8} className="px-4 py-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#1b3272]">{reference.full_name}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {reference.contact_count} contatti associati · {accountLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onToggle}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Chiudi scheda
                </button>
              </div>

              <form id={formId} action={action} className="space-y-4">
                <input type="hidden" name="referenceId" value={reference.id} />
                <input type="hidden" name="fullName" value={reference.full_name} />
                <div className="grid gap-3 md:grid-cols-4">
                  <label className="text-sm font-medium text-slate-700">
                    Nome
                    <input required name="firstName" defaultValue={reference.first_name} className={inputClass} />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Cognome
                    <input name="lastName" defaultValue={reference.last_name ?? ""} className={inputClass} />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Email
                    <input name="email" type="email" defaultValue={reference.email ?? ""} className={inputClass} />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Telefono
                    <input name="phone" type="tel" defaultValue={reference.phone ?? ""} className={inputClass} />
                  </label>
                  <label className="text-sm font-medium text-slate-700 md:col-span-4">
                    Note
                    <input name="notes" defaultValue={reference.notes ?? ""} className={inputClass} />
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <input
                      name="active"
                      type="checkbox"
                      defaultChecked={reference.active}
                      className="h-4 w-4 accent-[#1b3272]"
                    />
                    <span>Attivo</span>
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <SubmitButton pending={pending}>Salva modifiche</SubmitButton>
                  {reference.linked_profile ? (
                    <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800">
                      Utente attivo
                    </span>
                  ) : (
                    <button
                      type="submit"
                      formAction={convertAction}
                      disabled={convertPending}
                      className="rounded-xl border border-[#1b3272] px-3 py-2.5 text-sm font-semibold text-[#1b3272] transition hover:bg-[#1b3272]/10 disabled:cursor-wait disabled:opacity-60"
                    >
                      {convertPending ? "Conversione..." : "Converti in utente"}
                    </button>
                  )}
                  <ActionMessage state={state} />
                  <ActionMessage state={convertState} />
                </div>
              </form>

              <form
                action={deleteAction}
                onSubmit={(event) => {
                  if (!window.confirm(`Eliminare il referente "${reference.full_name}" dalle liste operative?`)) {
                    event.preventDefault();
                  }
                }}
                className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-red-100 bg-red-50/70 px-3 py-2"
              >
                <input type="hidden" name="referenceId" value={reference.id} />
                <label className="flex items-center gap-2 text-xs font-medium text-red-900">
                  Conferma
                  <input
                    name="confirmation"
                    placeholder="ELIMINA"
                    aria-label="Scrivi ELIMINA per confermare"
                    className="h-9 w-28 rounded-lg border border-red-200 bg-white px-2 text-sm text-slate-900 placeholder:text-red-300 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-400/20"
                  />
                </label>
                <button
                  type="submit"
                  disabled={deletePending}
                  title={deletePending ? "Eliminazione in corso" : "Elimina referente"}
                  aria-label={deletePending ? "Eliminazione in corso" : "Elimina referente"}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-red-700 text-white transition hover:bg-red-800 disabled:cursor-wait disabled:opacity-60"
                >
                  {deletePending ? (
                    <span className="text-xs font-semibold">...</span>
                  ) : (
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    >
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M19 6l-1 16H6L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                    </svg>
                  )}
                </button>
                <ActionMessage state={deleteState} />
              </form>

              <div className="mt-6 border-t border-slate-200 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h4 className="font-semibold text-[#1b3272]">Contatti associati</h4>
                  {reference.contacts.length > 50 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllContacts((current) => !current)}
                      className="text-sm font-semibold text-[#d43c2f] hover:underline"
                    >
                      {showAllContacts ? "Mostra solo i primi 50" : `Vedi tutti (${reference.contacts.length})`}
                    </button>
                  ) : null}
                </div>
                {visibleContacts.length > 0 ? (
                  <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Nome</th>
                          <th className="px-3 py-2">Cognome</th>
                          <th className="px-3 py-2">Carica</th>
                          <th className="px-3 py-2">Istituzione</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleContacts.map((contact) => (
                          <tr key={contact.id} className="hover:bg-[#f8fafc]">
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => onOpenContact(contact)}
                                className="font-semibold text-[#1b3272] hover:underline"
                              >
                                {contact.first_name || "—"}
                              </button>
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => onOpenContact(contact)}
                                className="text-left font-semibold text-[#1b3272] hover:underline"
                              >
                                {contact.last_name || "—"}
                              </button>
                            </td>
                            <td className="px-3 py-2 text-slate-700">{contact.institutional_role || "—"}</td>
                            <td className="px-3 py-2 text-slate-700">{contact.institution || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-3 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
                    Nessun contatto associato a questo referente.
                  </p>
                )}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function ReferenceManagement({
  references,
  groups,
  contactReferences,
  languages,
}: {
  references: Reference[];
  groups: Option[];
  contactReferences: Option[];
  languages: LanguageOption[];
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("last_name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [openReferenceId, setOpenReferenceId] = useState<number | null>(null);
  const [selectedContact, setSelectedContact] = useState<ContactRecord | null>(null);
  const deferredSearch = useDeferredValue(search);

  const filteredReferences = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    const direction = sortDirection === "asc" ? 1 : -1;

    return references
      .filter((reference) => {
        const haystack = [
          reference.first_name,
          reference.last_name,
          reference.full_name,
          reference.email,
          reference.phone,
          reference.notes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const matchesSearch = !term || haystack.includes(term);
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "active" ? reference.active : !reference.active);
        const matchesAccount =
          accountFilter === "all" ||
          (accountFilter === "linked" ? reference.linked_profile : !reference.linked_profile);
        return matchesSearch && matchesStatus && matchesAccount;
      })
      .sort((a, b) => {
        const aValue =
          sortKey === "contact_count" || sortKey === "active" || sortKey === "linked_profile"
            ? Number(a[sortKey])
            : String(a[sortKey] ?? "").toLowerCase();
        const bValue =
          sortKey === "contact_count" || sortKey === "active" || sortKey === "linked_profile"
            ? Number(b[sortKey])
            : String(b[sortKey] ?? "").toLowerCase();

        if (aValue < bValue) return -1 * direction;
        if (aValue > bValue) return direction;
        return 0;
      });
  }, [accountFilter, deferredSearch, references, sortDirection, sortKey, statusFilter]);

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection("asc");
  }

  function sortLabel(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDirection === "asc" ? " ↑" : " ↓";
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-[#d9e1f2] bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-[#1b3272]">Nuovo referente</h2>
        <CreateReferenceForm />
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#d9e1f2] bg-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-xl font-semibold text-[#1b3272]">Referenti</h2>
            <p className="mt-1 text-sm text-slate-600">
              {filteredReferences.length} di {references.length} referenti
            </p>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-3 lg:max-w-3xl">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cerca nome, email, telefono o note"
              aria-label="Cerca referenti"
              className={inputClass}
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filtra per stato"
              className={inputClass}
            >
              <option value="all">Tutti gli stati</option>
              <option value="active">Attivi</option>
              <option value="inactive">Disattivati</option>
            </select>
            <select
              value={accountFilter}
              onChange={(event) => setAccountFilter(event.target.value)}
              aria-label="Filtra per account"
              className={inputClass}
            >
              <option value="all">Tutti gli account</option>
              <option value="linked">Account collegato</option>
              <option value="unlinked">Senza account</option>
            </select>
          </div>
        </div>
        <div className="w-full overflow-hidden">
          <table className="w-full table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[18%]" />
              <col className="w-[19%]" />
              <col className="w-[8%]" />
              <col className="w-[12%]" />
              <col className="w-[8%]" />
              <col className="w-[7%]" />
            </colgroup>
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-3">
                  <button type="button" onClick={() => toggleSort("first_name")}>
                    Nome{sortLabel("first_name")}
                  </button>
                </th>
                <th className="px-3 py-3">
                  <button type="button" onClick={() => toggleSort("last_name")}>
                    Cognome{sortLabel("last_name")}
                  </button>
                </th>
                <th className="px-3 py-3">
                  <button type="button" onClick={() => toggleSort("email")}>
                    Email{sortLabel("email")}
                  </button>
                </th>
                <th className="px-3 py-3">Note</th>
                <th className="px-3 py-3">
                  <button type="button" onClick={() => toggleSort("contact_count")}>
                    Contatti{sortLabel("contact_count")}
                  </button>
                </th>
                <th className="px-3 py-3">
                  <button type="button" onClick={() => toggleSort("linked_profile")}>
                    Account{sortLabel("linked_profile")}
                  </button>
                </th>
                <th className="px-3 py-3">
                  <button type="button" onClick={() => toggleSort("active")}>
                    Stato{sortLabel("active")}
                  </button>
                </th>
                <th className="px-3 py-3 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filteredReferences.map((reference) => (
                <ReferenceRow
                  key={reference.id}
                  reference={reference}
                  isOpen={openReferenceId === reference.id}
                  onToggle={() => setOpenReferenceId((current) => (current === reference.id ? null : reference.id))}
                  onOpenContact={setSelectedContact}
                />
              ))}
              {filteredReferences.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                    Nessun referente trovato con i filtri selezionati.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      {selectedContact ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-label="Scheda contatto"
          onClick={() => setSelectedContact(null)}
        >
          <div
            className="w-full max-w-5xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedContact(null)}
                className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Chiudi
              </button>
            </div>
            <ContactEditor
              key={selectedContact.id}
              contact={selectedContact}
              groups={groups}
              references={contactReferences}
              languages={languages}
              isManager
              open
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
