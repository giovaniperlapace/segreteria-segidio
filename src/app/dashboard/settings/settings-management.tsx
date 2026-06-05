"use client";

import Link from "next/link";
import { createLanguageAction, updateLanguageAction } from "../archive-actions";
import { ActionMessage, inputClass, SubmitButton, useArchiveAction } from "../archive-ui";

type Language = {
  id: number;
  name: string;
  active: boolean;
  sort_order: number;
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
            className="w-full min-w-44 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#b56b32] focus:outline-none focus:ring-2 focus:ring-[#b56b32]/20"
          />
        </td>
        <td className="px-4 py-3">
          <input
            form={formId}
            name="sortOrder"
            type="number"
            defaultValue={language.sort_order}
            aria-label={`Ordine lingua ${language.name}`}
            className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#b56b32] focus:outline-none focus:ring-2 focus:ring-[#b56b32]/20"
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
              className="h-4 w-4 accent-[#173f5f]"
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

export function SettingsManagement({ languages }: { languages: Language[] }) {
  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-[#d8d1bd] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[#173f5f]">Impostazioni archivio</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Le lingue alimentano il selettore dei contatti. Il campo resta testuale per non bloccare
          l&apos;importazione dei dati Access se compaiono valori non ancora normalizzati.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <Link
            href="/dashboard/groups"
            className="rounded-xl border border-[#d8d1bd] px-4 py-3 text-sm font-semibold text-[#173f5f] hover:border-[#b56b32]"
          >
            Gestisci gruppi
          </Link>
          <Link
            href="/dashboard/references"
            className="rounded-xl border border-[#d8d1bd] px-4 py-3 text-sm font-semibold text-[#173f5f] hover:border-[#b56b32]"
          >
            Gestisci riferimenti interni
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-[#d8d1bd] bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-[#173f5f]">Nuova lingua</h2>
        <CreateLanguageForm />
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#d8d1bd] bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-[#173f5f]">Lingue disponibili</h2>
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
    </div>
  );
}
