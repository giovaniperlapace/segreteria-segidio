"use client";

import { decideInvitationProposalAction } from "./actions";
import { ActionMessage, inputClass, SubmitButton, useArchiveAction } from "../archive-ui";

export type ProposalRecord = {
  id: number;
  eventId: number;
  eventTitle: string;
  eventStartsAt: string;
  contactName: string;
  contactDetail: string;
  managerNote: string | null;
  status: "pending" | "approved" | "excluded";
  decisionNote: string | null;
};

function ProposalDecisionForm({ proposal }: { proposal: ProposalRecord }) {
  const [state, action, pending] = useArchiveAction(decideInvitationProposalAction);
  return (
    <form action={action} className="mt-4 space-y-3 border-t border-slate-200 pt-4">
      <input type="hidden" name="proposalId" value={proposal.id} />
      <input type="hidden" name="eventId" value={proposal.eventId} />
      <label className="text-sm font-medium text-slate-700">
        Nota decisione
        <textarea name="decisionNote" rows={2} className={inputClass} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-slate-700">
          Decisione
          <select name="decision" defaultValue="approved" className={inputClass}>
            <option value="approved">Approva</option>
            <option value="excluded">Escludi</option>
          </select>
        </label>
        <div className="pt-6"><SubmitButton pending={pending}>Salva decisione</SubmitButton></div>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

export function ProposalReview({ proposals }: { proposals: ProposalRecord[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {proposals.map((proposal) => (
        <article key={proposal.id} className="rounded-2xl border border-[#d9e1f2] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#d43c2f]">
                {proposal.eventTitle} · {new Date(proposal.eventStartsAt).toLocaleDateString("it-IT")}
              </p>
              <h2 className="mt-2 text-lg font-semibold text-[#1b3272]">{proposal.contactName}</h2>
              <p className="mt-1 text-sm text-slate-600">{proposal.contactDetail || "Nessun dettaglio"}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              proposal.status === "pending"
                ? "bg-amber-100 text-amber-900"
                : proposal.status === "approved"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-200 text-slate-700"
            }`}>
              {proposal.status === "pending" ? "Da valutare" : proposal.status === "approved" ? "Approvata" : "Esclusa"}
            </span>
          </div>
          {proposal.managerNote ? (
            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Nota manager: {proposal.managerNote}
            </p>
          ) : null}
          {proposal.status === "pending" ? (
            <ProposalDecisionForm proposal={proposal} />
          ) : proposal.decisionNote ? (
            <p className="mt-3 text-sm text-slate-600">Nota decisione: {proposal.decisionNote}</p>
          ) : null}
        </article>
      ))}
      {proposals.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-slate-500 lg:col-span-2">
          Nessuna proposta assegnata.
        </p>
      ) : null}
    </div>
  );
}
