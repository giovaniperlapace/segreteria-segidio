"use client";

import { createReferenceAction, updateReferenceAction } from "../archive-actions";
import { ActionMessage, inputClass, SubmitButton, useArchiveAction } from "../archive-ui";

type Reference = {
  id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  active: boolean;
  linked_profile: boolean;
  contact_count: number;
};

function Fields({ reference }: { reference?: Reference }) {
  return (
    <>
      <label className="text-sm font-medium text-slate-700">Nome completo<input required name="fullName" defaultValue={reference?.full_name ?? ""} className={inputClass} /></label>
      <label className="text-sm font-medium text-slate-700">Email<input name="email" type="email" defaultValue={reference?.email ?? ""} className={inputClass} /></label>
      <label className="text-sm font-medium text-slate-700">Telefono<input name="phone" type="tel" defaultValue={reference?.phone ?? ""} className={inputClass} /></label>
      <label className="text-sm font-medium text-slate-700 md:col-span-3">Note<input name="notes" defaultValue={reference?.notes ?? ""} className={inputClass} /></label>
    </>
  );
}

function CreateReferenceForm() {
  const [state, action, pending] = useArchiveAction(createReferenceAction);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3"><Fields /></div>
      <div className="flex flex-wrap items-center gap-3"><SubmitButton pending={pending}>Crea riferimento</SubmitButton><ActionMessage state={state} /></div>
    </form>
  );
}

function ReferenceEditor({ reference }: { reference: Reference }) {
  const [state, action, pending] = useArchiveAction(updateReferenceAction);
  return (
    <form action={action} className="rounded-2xl border border-[#d8d1bd] bg-white p-5 shadow-sm">
      <input type="hidden" name="referenceId" value={reference.id} />
      <div className="grid gap-3 md:grid-cols-3"><Fields reference={reference} /></div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-700"><input name="active" type="checkbox" defaultChecked={reference.active} className="h-4 w-4 accent-[#173f5f]" />Attivo</label>
        <SubmitButton pending={pending}>Salva</SubmitButton>
        <span className="text-xs text-slate-500">{reference.contact_count} contatti · {reference.linked_profile ? "account collegato" : "nessun account collegato"}</span>
      </div>
      <div className="mt-3"><ActionMessage state={state} /></div>
    </form>
  );
}

export function ReferenceManagement({ references }: { references: Reference[] }) {
  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-[#d8d1bd] bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-semibold text-[#173f5f]">Nuovo riferimento</h2><CreateReferenceForm /></section>
      <section className="space-y-3">
        {references.map((reference) => <ReferenceEditor key={reference.id} reference={reference} />)}
        {references.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-slate-500">Nessun riferimento creato.</p> : null}
      </section>
    </div>
  );
}
