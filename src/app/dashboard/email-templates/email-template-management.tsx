"use client";

import { useRef, useState } from "react";
import { EMAIL_TEMPLATE_VARIABLES } from "@/lib/email/templates";
import { ActionMessage, inputClass, SubmitButton, useArchiveAction } from "../archive-ui";
import {
  createEmailTemplateAction,
  deleteEmailTemplateAction,
  updateEmailTemplateAction,
} from "./actions";

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
  bodyTextareaRef,
  onBodyFocus,
}: {
  template?: EmailTemplateRecord;
  onDone?: () => void;
  bodyTextareaRef?: React.Ref<HTMLTextAreaElement>;
  onBodyFocus: (textarea: HTMLTextAreaElement) => void;
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
          ref={bodyTextareaRef}
          name="bodyText"
          rows={10}
          defaultValue={template?.body_text ?? ""}
          onFocus={(event) => onBodyFocus(event.currentTarget)}
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

function DeleteTemplateButton({ template }: { template: EmailTemplateRecord }) {
  const [state, action, pending] = useArchiveAction(deleteEmailTemplateAction);

  return (
    <div>
      <form
        action={action}
        onSubmit={(event) => {
          if (!window.confirm(`Eliminare definitivamente il template "${template.name}"?`)) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="templateId" value={template.id} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "Eliminazione..." : "Elimina"}
        </button>
      </form>
      {state.status !== "idle" ? (
        <div className="mt-2 max-w-sm">
          <ActionMessage state={state} />
        </div>
      ) : null}
    </div>
  );
}

export function EmailTemplateManagement({ templates }: { templates: EmailTemplateRecord[] }) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const createBodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const activeBodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  const inactiveTemplateCount = templates.filter((template) => !template.active).length;
  const visibleTemplates = showInactive
    ? templates
    : templates.filter((template) => template.active);

  function insertVariable(variable: string) {
    const activeTextarea = activeBodyTextareaRef.current;
    const textarea = activeTextarea?.isConnected ? activeTextarea : createBodyTextareaRef.current;

    if (!textarea) return;

    const token = `{{${variable}}}`;
    const selectionStart = textarea.selectionStart ?? textarea.value.length;
    const selectionEnd = textarea.selectionEnd ?? selectionStart;

    textarea.setRangeText(token, selectionStart, selectionEnd, "end");
    textarea.focus();
    activeBodyTextareaRef.current = textarea;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="rounded-xl border border-[#d9e1f2] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[#1b3272]">Nuovo template</h2>
        <div className="mt-4">
          <TemplateForm
            bodyTextareaRef={createBodyTextareaRef}
            onBodyFocus={(textarea) => {
              activeBodyTextareaRef.current = textarea;
            }}
          />
        </div>
      </section>

      <section className="space-y-4">
        <div className="rounded-xl border border-[#d9e1f2] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-[#1b3272]">Variabili disponibili</h2>
          <p className="mt-1 text-xs text-slate-500">
            Clicca una variabile per inserirla nel testo email, nella posizione del cursore.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {EMAIL_TEMPLATE_VARIABLES.map((variable) => (
              <button
                key={variable}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertVariable(variable)}
                title={`Inserisci {{${variable}}} nel testo email`}
                className="rounded-md border border-slate-200 bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700 transition hover:border-[#1b3272] hover:bg-blue-50 hover:text-[#1b3272] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1b3272]"
              >
                {`{{${variable}}}`}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#d9e1f2] bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-[#1b3272]">Template salvati</h2>
            {inactiveTemplateCount > 0 ? (
              <button
                type="button"
                onClick={() => setShowInactive((current) => !current)}
                aria-expanded={showInactive}
                className="text-sm font-semibold text-[#1b3272] underline decoration-[#1b3272]/40 underline-offset-4 hover:decoration-[#1b3272]"
              >
                {showInactive
                  ? "Nascondi i non attivi"
                  : `Mostra anche i non attivi (${inactiveTemplateCount})`}
              </button>
            ) : null}
          </div>
          <div className="divide-y divide-slate-100">
            {templates.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500">Nessun template email salvato.</p>
            ) : visibleTemplates.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500">Nessun template attivo.</p>
            ) : (
              visibleTemplates.map((template) => (
                <div key={template.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">{template.name}</h3>
                      <p className="mt-1 text-sm text-slate-600">{template.subject}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            checked={template.active}
                            disabled
                            aria-label={template.active ? "Template attivo" : "Template non attivo"}
                            className="h-4 w-4 rounded border-slate-300 text-[#1b3272] disabled:opacity-100"
                          />
                          {template.active ? "Attivo" : "Non attivo"}
                        </label>
                        <span className="text-xs text-slate-500">
                          Aggiornato {formatDate(template.updated_at)}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-start gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedTemplateId(
                          selectedTemplateId === template.id ? null : template.id,
                        )}
                        className="rounded-xl border border-[#1b3272] px-3 py-2 text-sm font-semibold text-[#1b3272] hover:bg-slate-50"
                      >
                        {selectedTemplateId === template.id ? "Chiudi" : "Modifica"}
                      </button>
                      <DeleteTemplateButton template={template} />
                    </div>
                  </div>
                  {selectedTemplate?.id === template.id ? (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <TemplateForm
                        template={selectedTemplate}
                        onBodyFocus={(textarea) => {
                          activeBodyTextareaRef.current = textarea;
                        }}
                      />
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
