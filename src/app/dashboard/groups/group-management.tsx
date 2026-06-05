"use client";

import { createGroupAction, updateGroupAction } from "../archive-actions";
import { ActionMessage, inputClass, SubmitButton, useArchiveAction } from "../archive-ui";

type Group = { id: number; name: string; description: string | null; active: boolean; contact_count: number };

function CreateGroupForm() {
  const [state, action, pending] = useArchiveAction(createGroupAction);
  return (
    <form action={action} className="grid gap-3 md:grid-cols-[1fr_2fr_auto] md:items-end">
      <label className="text-sm font-medium text-slate-700">Nome<input required name="name" className={inputClass} /></label>
      <label className="text-sm font-medium text-slate-700">Descrizione<input name="description" className={inputClass} /></label>
      <SubmitButton pending={pending}>Crea gruppo</SubmitButton>
      <div className="md:col-span-3"><ActionMessage state={state} /></div>
    </form>
  );
}

function GroupEditor({ group }: { group: Group }) {
  const [state, action, pending] = useArchiveAction(updateGroupAction);
  return (
    <form action={action} className="rounded-2xl border border-[#d8d1bd] bg-white p-5 shadow-sm">
      <input type="hidden" name="groupId" value={group.id} />
      <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto_auto] md:items-end">
        <label className="text-sm font-medium text-slate-700">Nome<input required name="name" defaultValue={group.name} className={inputClass} /></label>
        <label className="text-sm font-medium text-slate-700">Descrizione<input name="description" defaultValue={group.description ?? ""} className={inputClass} /></label>
        <label className="flex items-center gap-2 pb-2.5 text-sm text-slate-700"><input name="active" type="checkbox" defaultChecked={group.active} className="h-4 w-4 accent-[#173f5f]" />Attivo</label>
        <SubmitButton pending={pending}>Salva</SubmitButton>
      </div>
      <p className="mt-3 text-xs text-slate-500">{group.contact_count} contatti associati</p>
      <div className="mt-3"><ActionMessage state={state} /></div>
    </form>
  );
}

export function GroupManagement({ groups }: { groups: Group[] }) {
  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-[#d8d1bd] bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-[#173f5f]">Nuovo gruppo</h2><CreateGroupForm />
      </section>
      <section className="space-y-3">
        {groups.map((group) => <GroupEditor key={group.id} group={group} />)}
        {groups.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-slate-500">Nessun gruppo creato.</p> : null}
      </section>
    </div>
  );
}
