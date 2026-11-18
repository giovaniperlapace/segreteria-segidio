"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadEmailRecipientContactAction } from "../../archive-actions";
import { ContactEditor, type ContactRecord } from "../../contacts/contact-management";
import { PendingSpinner } from "../../archive-ui";

type ContactResult = Extract<Awaited<ReturnType<typeof loadEmailRecipientContactAction>>, { status: "success" }>;

export function RecipientContactDialog({ eventId, batchId, logId, name, onClose, onUpdated }: {
  eventId: number; batchId: number; logId: number; name: string;
  onClose: () => void; onUpdated: (contact: ContactRecord) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<ContactResult | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    let cancelled = false;
    loadEmailRecipientContactAction(eventId, batchId, logId).then(result => {
      if (cancelled) return;
      if (result.status === "success") setData(result);
      else setError(result.message);
    }).catch(() => { if (!cancelled) setError("Impossibile caricare la scheda contatto."); });
    return () => { cancelled = true; element?.close(); };
  }, [eventId, batchId, logId]);

  const handleUpdated = useCallback((contact: ContactRecord) => {
    setData(current => current ? { ...current, contact } : current);
    onUpdated(contact);
  }, [onUpdated]);

  return (
    <dialog ref={dialog} aria-labelledby="recipient-contact-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => event.stopPropagation()}
      className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-950/45">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white p-5">
        <h2 id="recipient-contact-title" className="text-xl font-semibold text-[#1b3272]">
          {data ? [data.contact.first_name, data.contact.last_name].filter(Boolean).join(" ") || name : name}
        </h2>
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
          Torna all’elenco
        </button>
      </header>
      <div className="p-5">
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p>
          : data ? <ContactEditor contact={data.contact as ContactRecord}
              groups={data.groups} references={data.references} languages={data.languages}
              isManager updateContactUrl={false} onContactUpdated={handleUpdated} />
          : <p className="flex items-center gap-2 text-sm text-slate-600"><PendingSpinner /> Caricamento scheda...</p>}
      </div>
    </dialog>
  );
}
