"use client";

import { useEffect, useRef, useState } from "react";
import { saveMissingRecipientEmailAction } from "../email-contact-actions";
import { PendingSpinner, inputClass } from "../../archive-ui";

export function MissingEmailDialog({ eventId, batchId, logId, name, email, onClose, onSaved }: {
  eventId: number; batchId: number; logId: number; name: string; email: string | null;
  onClose: () => void; onSaved: (email: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(email ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog ref={dialog} aria-labelledby="missing-email-title"
      onCancel={(event) => { event.preventDefault(); if (!pending) onClose(); }}
      onKeyDown={(event) => event.stopPropagation()}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl backdrop:bg-slate-950/45">
      <h2 id="missing-email-title" className="text-lg font-semibold text-[#1b3272]">{name}</h2>
      <form className="mt-4 space-y-4" onSubmit={async (event) => {
        event.preventDefault();
        if (pending) return;
        setPending(true); setError("");
        try {
          const result = await saveMissingRecipientEmailAction(eventId, batchId, logId, value);
          if (result.status === "success") onSaved(result.email);
          else setError(result.message);
        } catch { setError("Impossibile salvare l’email. Riprova."); }
        finally { setPending(false); }
      }}>
        <label className="block text-sm font-medium text-slate-700">
          Email del contatto
          <input autoFocus type="email" required maxLength={254} value={value} disabled={pending}
            onChange={(event) => setValue(event.target.value)} className={inputClass} />
        </label>
        <p className="text-xs text-slate-500">L’indirizzo viene salvato nell’archivio contatti. L’email saltata non viene inviata automaticamente.</p>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" disabled={pending} onClick={onClose} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">Annulla</button>
          <button type="submit" disabled={pending} aria-busy={pending} className="inline-flex items-center gap-2 rounded-xl bg-[#1b3272] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {pending ? <PendingSpinner /> : null}Salva e torna all’elenco
          </button>
        </div>
      </form>
    </dialog>
  );
}
