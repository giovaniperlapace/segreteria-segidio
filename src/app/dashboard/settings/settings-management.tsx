"use client";

import Link from "next/link";
import {
  createGroupAction,
  createLanguageAction,
  updateGroupAction,
  updateLanguageAction,
} from "../archive-actions";
import { ActionMessage, inputClass, SubmitButton, useArchiveAction } from "../archive-ui";

type Language = {
  id: number;
  name: string;
  active: boolean;
  sort_order: number;
  contact_count: number;
};

type Group = {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  contact_count: number;
};

function CreateLanguageForm() {
  const [state, action, pending] = useArchiveAction(createLanguageAction);

  return (
    <form action={action} className="grid gap-3 md:grid-cols-[1fr_10rem_auto] md:items-end">
      <label className="text-sm font-medium text-slate-700">
        Lingua
        <input required name="name" placeholder="Es. Greco" className={inputClass} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Ordine
        <input name="sortOrder" type="number" defaultValue={100} className={inputClass} />
      </label>
      <SubmitButton pending={pending}>Aggiungi lingua</SubmitButton>
      <div className="md:col-span-3">
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

function CreateGroupForm() {
  const [state, action, pending] = useArchiveAction(createGroupAction);

  return (
    <form action={action} className="grid gap-3 md:grid-cols-[1fr_2fr_auto] md:items-end">
      <label className="text-sm font-medium text-slate-700">
        Nome
        <input required name="name" className={inputClass} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Descrizione
        <input name="description" className={inputClass} />
      </label>
      <SubmitButton pending={pending}>Aggiungi gruppo</SubmitButton>
      <div className="md:col-span-3">
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

function LanguageEditor({ language }: { language: Language }) {
  const [state, action, pending] = useArchiveAction(updateLanguageAction);
  const formId = `language-${language.id}`;

  return (
    <>
      <tr className="border-t border-slate-200 align-top">
        <td className="px-4 py-3">
          <form id={formId} action={action}>
            <input type="hidden" name="languageId" value={language.id} />
          </form>
          <input
            required
            form={formId}
            name="name"
            defaultValue={language.name}
            aria-label={`Nome lingua ${language.name}`}
            className="w-full min-w-44 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#d43c2f] focus:outline-none focus:ring-2 focus:ring-[#d43c2f]/20"
          />
        </td>
        <td className="px-4 py-3">
          <input
            form={formId}
            name="sortOrder"
            type="number"
            defaultValue={language.sort_order}
            aria-label={`Ordine lingua ${language.name}`}
            className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#d43c2f] focus:outline-none focus:ring-2 focus:ring-[#d43c2f]/20"
          />
        </td>
        <td className="px-4 py-3 text-sm text-slate-600">
          {language.contact_count}
        </td>
        <td className="px-4 py-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              form={formId}
              name="active"
              type="checkbox"
              defaultChecked={language.active}
              className="h-4 w-4 accent-[#1b3272]"
            />
            <span>Attiva</span>
          </label>
        </td>
        <td className="px-4 py-3 text-right">
          <SubmitButton pending={pending}>Salva</SubmitButton>
        </td>
      </tr>
      {state.status !== "idle" ? (
        <tr className="border-t border-slate-100">
          <td colSpan={5} className="px-4 py-2">
            <ActionMessage state={state} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function GroupEditor({ group }: { group: Group }) {
  const [state, action, pending] = useArchiveAction(updateGroupAction);
  const formId = `group-${group.id}`;

  return (
    <>
      <tr className="border-t border-slate-200 align-top">
        <td className="px-4 py-3">
          <form id={formId} action={action}>
            <input type="hidden" name="groupId" value={group.id} />
          </form>
          <input
            required
            form={formId}
            name="name"
            defaultValue={group.name}
            aria-label={`Nome gruppo ${group.name}`}
            className="w-full min-w-44 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#d43c2f] focus:outline-none focus:ring-2 focus:ring-[#d43c2f]/20"
          />
        </td>
        <td className="px-4 py-3">
          <input
            form={formId}
            name="description"
            defaultValue={group.description ?? ""}
            aria-label={`Descrizione gruppo ${group.name}`}
            className="w-full min-w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#d43c2f] focus:outline-none focus:ring-2 focus:ring-[#d43c2f]/20"
          />
        </td>
        <td className="px-4 py-3 text-sm text-slate-600">{group.contact_count}</td>
        <td className="px-4 py-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              form={formId}
              name="active"
              type="checkbox"
              defaultChecked={group.active}
              className="h-4 w-4 accent-[#1b3272]"
            />
            <span>Attivo</span>
          </label>
        </td>
        <td className="px-4 py-3 text-right">
          <SubmitButton pending={pending}>Salva</SubmitButton>
        </td>
      </tr>
      {state.status !== "idle" ? (
        <tr className="border-t border-slate-100">
          <td colSpan={5} className="px-4 py-2">
            <ActionMessage state={state} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function SettingsManagement({ languages, groups }: { languages: Language[]; groups: Group[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_1fr] lg:items-start">
      <aside className="rounded-2xl border border-[#d9e1f2] bg-white p-3 shadow-sm lg:sticky lg:top-6">
        <nav aria-label="Sezioni settings" className="grid gap-1">
          <a
            href="#lingue"
            className="rounded-xl px-3 py-2 text-sm font-semibold text-[#1b3272] hover:bg-[#eef3ff]"
          >
            Lingue
          </a>
          <a
            href="#gruppi"
            className="rounded-xl px-3 py-2 text-sm font-semibold text-[#1b3272] hover:bg-[#eef3ff]"
          >
            Gruppi
          </a>
          <Link
            href="/dashboard/users"
            className="mt-2 rounded-xl border border-[#d9e1f2] bg-[#1b3272] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#263f86]"
          >
            Utenti e ruoli
          </Link>
        </nav>
      </aside>

      <div className="space-y-8">
        <section id="lingue" className="scroll-mt-6 space-y-5">
          <div className="rounded-2xl border border-[#d9e1f2] bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-[#1b3272]">Lingue</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Le lingue alimentano il selettore dei contatti. Il campo resta testuale per non
              bloccare l&apos;importazione dei dati Access se compaiono valori non ancora normalizzati.
            </p>
          </div>

          <section className="rounded-2xl border border-[#d9e1f2] bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-[#1b3272]">Nuova lingua</h3>
            <CreateLanguageForm />
          </section>

          <section className="overflow-hidden rounded-2xl border border-[#d9e1f2] bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-[#1b3272]">Lingue disponibili</h3>
              <p className="mt-1 text-sm text-slate-600">
                {languages.length} {languages.length === 1 ? "lingua configurata" : "lingue configurate"}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Lingua</th>
                    <th className="px-4 py-3">Ordine</th>
                    <th className="px-4 py-3">Contatti</th>
                    <th className="px-4 py-3">Stato</th>
                    <th className="px-4 py-3 text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {languages.map((language) => (
                    <LanguageEditor key={language.id} language={language} />
                  ))}
                  {languages.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                        Nessuna lingua configurata.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </section>

        <section id="gruppi" className="scroll-mt-6 space-y-5">
          <div className="rounded-2xl border border-[#d9e1f2] bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-[#1b3272]">Gruppi</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              I gruppi organizzano i contatti in categorie operative e possono essere disattivati
              senza perdere le associazioni storiche.
            </p>
          </div>

          <section className="rounded-2xl border border-[#d9e1f2] bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-[#1b3272]">Nuovo gruppo</h3>
            <CreateGroupForm />
          </section>

          <section className="overflow-hidden rounded-2xl border border-[#d9e1f2] bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-[#1b3272]">Gruppi disponibili</h3>
              <p className="mt-1 text-sm text-slate-600">
                {groups.length} {groups.length === 1 ? "gruppo configurato" : "gruppi configurati"}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-left">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Gruppo</th>
                    <th className="px-4 py-3">Descrizione</th>
                    <th className="px-4 py-3">Contatti</th>
                    <th className="px-4 py-3">Stato</th>
                    <th className="px-4 py-3 text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <GroupEditor key={group.id} group={group} />
                  ))}
                  {groups.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                        Nessun gruppo configurato.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </div>
    </div>
  );
}
