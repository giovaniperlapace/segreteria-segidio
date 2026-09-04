"use client";

import { useState } from "react";
import {
  PUBLIC_RESPONSE_CHOICES,
  PUBLIC_RESPONSE_CHOICE_LABELS,
  type PublicResponseChoice,
} from "@/lib/email/public-response-links";
import { submitPublicInvitationResponse } from "./actions";

function statusDescription(status: PublicResponseChoice) {
  if (status === "attending") return "Confermo la mia presenza all'evento.";
  if (status === "declined") return "Non potrò partecipare all'evento.";
  if (status === "delegated") {
    return "Non potrò partecipare, ma indico una persona che parteciperà al mio posto.";
  }
  return "Al momento penso di partecipare, ma non è ancora definitivo.";
}

export function PublicResponseForm({
  token,
  initialChoice,
  delegateFirstName,
  delegateLastName,
  delegateEmail,
}: {
  token: string;
  initialChoice: PublicResponseChoice | null;
  delegateFirstName: string;
  delegateLastName: string;
  delegateEmail: string;
}) {
  const [choice, setChoice] = useState<PublicResponseChoice | null>(initialChoice);
  const delegated = choice === "delegated";

  return (
    <form action={submitPublicInvitationResponse} className="mt-7 space-y-4">
      <input type="hidden" name="token" value={token} />
      <fieldset className="space-y-3">
        <legend className="text-base font-semibold text-slate-900">
          Comunichi la sua risposta
        </legend>
        {PUBLIC_RESPONSE_CHOICES.map((status) => (
          <div
            key={status}
            className="block cursor-pointer rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-[#1b3272]"
          >
            <label className="flex cursor-pointer gap-3">
              <input
                type="radio"
                name="responseStatus"
                value={status}
                checked={choice === status}
                onChange={() => setChoice(status)}
                className="mt-1 h-4 w-4 accent-[#1b3272]"
                required
              />
              <span>
                <span className="block font-semibold text-slate-900">
                  {PUBLIC_RESPONSE_CHOICE_LABELS[status]}
                </span>
                <span className="mt-1 block text-sm leading-5 text-slate-600">
                  {statusDescription(status)}
                </span>
              </span>
            </label>
            {status === "delegated" && delegated ? (
              <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Nome del delegato
                  <input
                    name="delegateFirstName"
                    defaultValue={delegateFirstName}
                    maxLength={200}
                    autoComplete="given-name"
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Cognome del delegato
                  <input
                    name="delegateLastName"
                    defaultValue={delegateLastName}
                    maxLength={200}
                    autoComplete="family-name"
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                  Email del delegato
                  <input
                    name="delegateEmail"
                    type="email"
                    defaultValue={delegateEmail}
                    maxLength={320}
                    autoComplete="email"
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  />
                </label>
                <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
                  Questi dati saranno usati soltanto per questo evento e non entreranno nell&apos;archivio dei contatti.
                </p>
              </div>
            ) : null}
          </div>
        ))}
      </fieldset>
      <button
        type="submit"
        className="w-full rounded-xl bg-[#1b3272] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#263f86]"
      >
        Invia risposta
      </button>
    </form>
  );
}
