"use client";

import { useDeferredValue, useMemo, useState } from "react";
import {
  convertReferenceToUserAction,
  createReferenceAction,
  deleteReferenceAction,
  updateReferenceAction,
} from "../archive-actions";
import { ActionMessage, inputClass, SubmitButton, useArchiveAction } from "../archive-ui";

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

type AssociatedContact = {
  id: number;
  first_name: string;
  last_name: string;
  institutional_role: string | null;
  institution: string | null;
};

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
        <SubmitButton pending={pending}>Crea riferimento</SubmitButton>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

function ReferenceRow({
  reference,
  isOpen,
  onToggle,
}: {
  reference: Reference;
  isOpen: boolean;
  onToggle: () => void;
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
        className={`cursor-pointer border-t border-slate-200 align-top hover:bg-[#f8f6ef] ${
          isOpen ? "bg-[#f8f6ef]" : ""
        }`}
        onClick={onToggle}
      >
        <td className="px-4 py-3 font-semibold text-[#173f5f]">
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
        <td className="px-4 py-3 text-slate-700">{reference.last_name || "—"}</td>
        <td className="px-4 py-3 text-slate-700">{reference.email || "—"}</td>
        <td className="px-4 py-3 text-slate-700">{reference.phone || "—"}</td>
        <td className="max-w-sm px-4 py-3 text-slate-700">
          <span className="line-clamp-2">{reference.notes || "—"}</span>
        </td>
        <td className="px-4 py-3 text-sm text-slate-700">{reference.contact_count}</td>
        <td className="px-4 py-3">
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
        <td className="px-4 py-3 text-slate-700">{reference.active ? "Attivo" : "Disattivato"}</td>
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            className="text-sm font-semibold text-[#b56b32] hover:underline"
          >
            {isOpen ? "Chiudi" : "Apri scheda"}
          </button>
        </td>
      </tr>
      {isOpen ? (
        <tr className="border-t border-slate-100 bg-[#fbfaf6]">
          <td colSpan={9} className="px-4 py-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#173f5f]">{reference.full_name}</h3>
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
                      className="h-4 w-4 accent-[#173f5f]"
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
                      className="rounded-xl border border-[#173f5f] px-3 py-2.5 text-sm font-semibold text-[#173f5f] transition hover:bg-[#173f5f]/10 disabled:cursor-wait disabled:opacity-60"
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
                  if (!window.confirm(`Eliminare il riferimento "${reference.full_name}" dalle liste operative?`)) {
                    event.preventDefault();
                  }
                }}
                className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4"
              >
                <input type="hidden" name="referenceId" value={reference.id} />
                <h4 className="text-sm font-semibold text-red-900">Elimina riferimento</h4>
                <p className="mt-1 text-sm text-red-800">
                  Il riferimento sparira&apos; dalle liste operative. I collegamenti storici restano conservati.
                </p>
                <label className="mt-3 block text-sm font-medium text-red-900">
                  Scrivi ELIMINA per confermare
                  <input
                    name="confirmation"
                    className="mt-1.5 w-full max-w-xs rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-400/20"
                  />
                </label>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={deletePending}
                    className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-wait disabled:opacity-60"
                  >
                    {deletePending ? "Eliminazione..." : "Elimina riferimento"}
                  </button>
                  <ActionMessage state={deleteState} />
                </div>
              </form>

              <div className="mt-6 border-t border-slate-200 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h4 className="font-semibold text-[#173f5f]">Contatti associati</h4>
                  {reference.contacts.length > 50 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllContacts((current) => !current)}
                      className="text-sm font-semibold text-[#b56b32] hover:underline"
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
                          <tr key={contact.id}>
                            <td className="px-3 py-2 text-slate-700">{contact.first_name || "—"}</td>
                            <td className="px-3 py-2 text-slate-700">{contact.last_name || "—"}</td>
                            <td className="px-3 py-2 text-slate-700">{contact.institutional_role || "—"}</td>
                            <td className="px-3 py-2 text-slate-700">{contact.institution || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-3 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
                    Nessun contatto associato a questo riferimento.
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

export function ReferenceManagement({ references }: { references: Reference[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("last_name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [openReferenceId, setOpenReferenceId] = useState<number | null>(null);
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
      <section className="rounded-2xl border border-[#d8d1bd] bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-[#173f5f]">Nuovo riferimento</h2>
        <CreateReferenceForm />
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#d8d1bd] bg-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-xl font-semibold text-[#173f5f]">Riferimenti</h2>
            <p className="mt-1 text-sm text-slate-600">
              {filteredReferences.length} di {references.length} riferimenti
            </p>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-3 lg:max-w-3xl">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cerca nome, email, telefono o note"
              aria-label="Cerca riferimenti"
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] border-collapse text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("first_name")}>
                    Nome{sortLabel("first_name")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("last_name")}>
                    Cognome{sortLabel("last_name")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("email")}>
                    Email{sortLabel("email")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("phone")}>
                    Telefono{sortLabel("phone")}
                  </button>
                </th>
                <th className="px-4 py-3">Note</th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("contact_count")}>
                    Contatti{sortLabel("contact_count")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("linked_profile")}>
                    Account{sortLabel("linked_profile")}
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort("active")}>
                    Stato{sortLabel("active")}
                  </button>
                </th>
                <th className="px-4 py-3 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filteredReferences.map((reference) => (
                <ReferenceRow
                  key={reference.id}
                  reference={reference}
                  isOpen={openReferenceId === reference.id}
                  onToggle={() => setOpenReferenceId((current) => (current === reference.id ? null : reference.id))}
                />
              ))}
              {filteredReferences.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">
                    Nessun riferimento trovato con i filtri selezionati.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
