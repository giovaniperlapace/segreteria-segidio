"use client";

import { useState } from "react";
import { EMAIL_TEMPLATE_VARIABLES } from "@/lib/email/templates";
import { ActionMessage, inputClass, SubmitButton, useArchiveAction } from "../archive-ui";
import { createEmailTemplateAction, updateEmailTemplateAction } from "./actions";

export type EmailTemplateRecord = {
  id: number;
  name: string;
  subject: string;
  body_text: string;
  active: boolean;
  updated_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function TemplateForm({
  template,
  onDone,
}: {
  template?: EmailTemplateRecord;
  onDone?: () => void;
}) {
  const [state, action, pending] = useArchiveAction(
    template ? updateEmailTemplateAction : createEmailTemplateAction,
  );

  return (
    <form
      action={async (formData) => {
        await action(formData);
        onDone?.();
      }}
      className="space-y-4"
    >
      {template ? <input type="hidden" name="templateId" value={template.id} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Nome template
          <input name="name" defaultValue={template?.name ?? ""} className={inputClass} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Oggetto
          <input name="subject" defaultValue={template?.subject ?? ""} className={inputClass} />
        </label>
      </div>
      <label className="text-sm font-medium text-slate-700">
        Testo email
        <textarea
          name="bodyText"
          rows={10}
          defaultValue={template?.body_text ?? ""}
          className={inputClass}
        />
      </label>
      <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          name="active"
          defaultChecked={template?.active ?? true}
          className="h-4 w-4 rounded border-slate-300 text-[#1b3272]"
        />
        Attivo
      </label>
      <ActionMessage state={state} />
      <div className="flex justify-end">
        <SubmitButton pending={pending}>{template ? "Aggiorna template" : "Crea template"}</SubmitButton>
      </div>
    </form>
  );
}

export function EmailTemplateManagement({ templates }: { templates: EmailTemplateRecord[] }) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="rounded-xl border border-[#d9e1f2] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[#1b3272]">Nuovo template</h2>
        <div className="mt-4">
          <TemplateForm />
        </div>
      </section>

      <section className="space-y-4">
        <div className="rounded-xl border border-[#d9e1f2] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-[#1b3272]">Variabili disponibili</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {EMAIL_TEMPLATE_VARIABLES.map((variable) => (
              <code key={variable} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                {`{{${variable}}}`}
              </code>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#d9e1f2] bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-[#1b3272]">Template salvati</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {templates.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500">Nessun template email salvato.</p>
            ) : (
              templates.map((template) => (
                <div key={template.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">{template.name}</h3>
                      <p className="mt-1 text-sm text-slate-600">{template.subject}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {template.active ? "Attivo" : "Non attivo"} · aggiornato {formatDate(template.updated_at)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedTemplateId(
                        selectedTemplateId === template.id ? null : template.id,
                      )}
                      className="rounded-xl border border-[#1b3272] px-3 py-2 text-sm font-semibold text-[#1b3272] hover:bg-slate-50"
                    >
                      {selectedTemplateId === template.id ? "Chiudi" : "Modifica"}
                    </button>
                  </div>
                  {selectedTemplate?.id === template.id ? (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <TemplateForm template={selectedTemplate} />
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
