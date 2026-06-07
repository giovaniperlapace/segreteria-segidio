"use client";

import { useMemo, useState } from "react";
import {
  addApprovedProposalsAction,
  bulkAddInvitationsAction,
  bulkCreateProposalsAction,
} from "../../actions";
import { ActionMessage, inputClass, SubmitButton, useArchiveAction } from "../../../archive-ui";

export type CandidateContact = {
  id: number;
  name: string;
  detail: string;
  email: string | null;
  status: "active" | "standby";
  priority: "standard" | "important" | "critical";
  groups: string[];
  references: string[];
  missingFields: string[];
  proposalSummary: string | null;
};

type ReferenceOption = {
  id: number;
  name: string;
};

function SelectedContactInputs({ selectedIds }: { selectedIds: number[] }) {
  return selectedIds.map((contactId) => (
    <input key={contactId} type="hidden" name="contactIds" value={contactId} />
  ));
}

export function BuildSelection({
  eventId,
  candidates,
  references,
  approvedProposalCount,
}: {
  eventId: number;
  candidates: CandidateContact[];
  references: ReferenceOption[];
  approvedProposalCount: number;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [inviteState, inviteAction, invitePending] = useArchiveAction(bulkAddInvitationsAction);
  const [proposalState, proposalAction, proposalPending] = useArchiveAction(bulkCreateProposalsAction);
  const [approvedState, approvedAction, approvedPending] = useArchiveAction(addApprovedProposalsAction);
  const selectedIds = useMemo(() => [...selected], [selected]);
  const allPageSelected =
    candidates.length > 0 && candidates.every((candidate) => selected.has(candidate.id));

  function toggleContact(contactId: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  function togglePage() {
    setSelected((current) => {
      const next = new Set(current);
      for (const candidate of candidates) {
        if (allPageSelected) next.delete(candidate.id);
        else next.add(candidate.id);
      }
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#d9e1f2] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#1b3272]">Risultati filtrati</h2>
            <p className="mt-1 text-sm text-slate-600">
              {selectedIds.length} selezionati nella pagina corrente
            </p>
          </div>
          <button
            type="button"
            onClick={togglePage}
            className="rounded-xl border border-[#1b3272] px-3 py-2 text-sm font-semibold text-[#1b3272] hover:bg-[#1b3272]/10"
          >
            {allPageSelected ? "Deseleziona pagina" : "Seleziona tutta la pagina"}
          </button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-600">
              <tr>
                <th className="px-3 py-3">Sel.</th>
                <th className="px-3 py-3">Contatto</th>
                <th className="px-3 py-3">Gruppi</th>
                <th className="px-3 py-3">Referenti</th>
                <th className="px-3 py-3">Stato dati</th>
                <th className="px-3 py-3">Proposte</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {candidates.map((candidate) => (
                <tr key={candidate.id} className={selected.has(candidate.id) ? "bg-blue-50/60" : "bg-white"}>
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(candidate.id)}
                      onChange={() => toggleContact(candidate.id)}
                      aria-label={`Seleziona ${candidate.name}`}
                      className="h-4 w-4 accent-[#1b3272]"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-semibold text-[#1b3272]">{candidate.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {[candidate.detail, candidate.email].filter(Boolean).join(" · ") || "Nessun dettaglio"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {candidate.status === "active" ? "Attivo" : "Non attivo"} · {candidate.priority}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-700">{candidate.groups.join(", ") || "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{candidate.references.join(", ") || "—"}</td>
                  <td className="px-3 py-3 text-slate-700">
                    {candidate.missingFields.length > 0
                      ? `Mancano: ${candidate.missingFields.join(", ")}`
                      : "Completi"}
                  </td>
                  <td className="px-3 py-3 text-slate-700">{candidate.proposalSummary || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {candidates.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">Nessun candidato corrisponde ai filtri.</p>
        ) : null}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <form action={inviteAction} className="space-y-3 rounded-2xl border border-[#d9e1f2] bg-white p-4 shadow-sm">
          <input type="hidden" name="eventId" value={eventId} />
          <SelectedContactInputs selectedIds={selectedIds} />
          <h2 className="text-lg font-semibold text-[#1b3272]">Inviti diretti</h2>
          <p className="text-sm text-slate-600">
            Inserisce subito i contatti nella lista effettiva dell&apos;evento.
          </p>
          <SubmitButton pending={invitePending}>Aggiungi {selectedIds.length} invitati</SubmitButton>
          <ActionMessage state={inviteState} />
        </form>

        <form action={proposalAction} className="space-y-3 rounded-2xl border border-[#d9e1f2] bg-white p-4 shadow-sm">
          <input type="hidden" name="eventId" value={eventId} />
          <SelectedContactInputs selectedIds={selectedIds} />
          <h2 className="text-lg font-semibold text-[#1b3272]">Proposte ai referenti</h2>
          <p className="text-sm text-slate-600">
            Le proposte restano fuori dalla lista invitati finché il manager non importa quelle approvate.
          </p>
          <fieldset className="text-sm font-medium text-slate-700">
            <legend>Referenti approvatori</legend>
            <div className="mt-1.5 max-h-44 overflow-y-auto rounded-xl border border-slate-300 bg-white p-2">
              {references.map((reference) => (
                <label
                  key={reference.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 font-normal hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    name="proposalReferenceIds"
                    value={reference.id}
                    className="h-4 w-4 accent-[#1b3272]"
                  />
                  <span>{reference.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {references.length === 0 ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Nessun referente è ancora collegato a un utente attivo. Completa il collegamento da Utenti prima di creare proposte.
            </p>
          ) : null}
          <label className="text-sm font-medium text-slate-700">
            Nota per i referenti
            <textarea name="managerNote" rows={2} className={inputClass} />
          </label>
          {references.length > 0 ? (
            <SubmitButton pending={proposalPending}>Crea proposte</SubmitButton>
          ) : null}
          <ActionMessage state={proposalState} />
        </form>
      </div>

      <form action={approvedAction} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <input type="hidden" name="eventId" value={eventId} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-emerald-900">Proposte approvate</h2>
            <p className="mt-1 text-sm text-emerald-800">
              {approvedProposalCount} approvazioni disponibili. I contatti duplicati vengono inseriti una sola volta.
            </p>
          </div>
          <SubmitButton pending={approvedPending}>Trasforma in inviti</SubmitButton>
        </div>
        <div className="mt-3"><ActionMessage state={approvedState} /></div>
      </form>
    </div>
  );
}
