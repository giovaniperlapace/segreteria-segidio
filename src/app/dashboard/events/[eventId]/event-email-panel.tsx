"use client";

import { useMemo } from "react";
import { ActionMessage, inputClass, PendingSpinner, SubmitButton, useArchiveAction } from "../../archive-ui";
import { createEmailBatchAction, sendEmailBatchAction } from "../email-actions";
import type { EventInvitationRecord } from "./invitation-management";

export type EventEmailTemplateOption = {
  id: number;
  name: string;
  subject: string;
};

export type EventEmailBatchRecord = {
  id: number;
  status: "draft" | "queued" | "sending" | "completed" | "completed_with_errors";
  target_kind: "selected" | "selected_rows" | "invited_no_response";
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  last_error: string | null;
  created_at: string;
  template_name: string;
  attachments: Array<{
    file_name: string;
    file_size_bytes: number;
  }>;
};

const TARGET_LABELS: Record<EventEmailBatchRecord["target_kind"], string> = {
  selected: "Da invitare",
  selected_rows: "Righe selezionate",
  invited_no_response: "Invitati senza risposta",
};

const STATUS_LABELS: Record<EventEmailBatchRecord["status"], string> = {
  draft: "Bozza",
  queued: "In coda",
  sending: "Invio",
  completed: "Completato",
  completed_with_errors: "Con errori",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function BatchSendForm({
  eventId,
  batch,
  includeFailed,
}: {
  eventId: number;
  batch: EventEmailBatchRecord;
  includeFailed?: boolean;
}) {
  const [state, action, pending] = useArchiveAction(sendEmailBatchAction);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="batchId" value={batch.id} />
      {includeFailed ? <input type="hidden" name="includeFailed" value="on" /> : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-xl bg-[#1b3272] px-3 py-2 text-sm font-semibold text-white hover:bg-[#263f86] disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? <PendingSpinner /> : null}
        {includeFailed ? "Ritenta errori" : "Invia prossimo blocco"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

export function EventEmailPanel({
  eventId,
  templates,
  batches,
  invitations,
  selectedInvitationIds,
}: {
  eventId: number;
  templates: EventEmailTemplateOption[];
  batches: EventEmailBatchRecord[];
  invitations: EventInvitationRecord[];
  selectedInvitationIds: Set<number>;
}) {
  const [createState, createAction, createPending] = useArchiveAction(createEmailBatchAction);
  const selectedRows = useMemo(
    () =>
      invitations.filter(
        (invitation) =>
          selectedInvitationIds.has(invitation.id) &&
          invitation.row_type === "invitation" &&
          (invitation.invitation_status === "selected" ||
            (invitation.invitation_status === "invited" &&
              invitation.response_status === "no_response")),
      ),
    [invitations, selectedInvitationIds],
  );
  const selectedCount = invitations.filter((invitation) => invitation.invitation_status === "selected").length;
  const reminderCount = invitations.filter(
    (invitation) =>
      invitation.invitation_status === "invited" && invitation.response_status === "no_response",
  ).length;

  return (
    <section className="rounded-xl border border-[#d9e1f2] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#1b3272]">Email inviti</h2>
          <p className="mt-1 text-sm text-slate-600">
            {selectedCount} da invitare · {reminderCount} invitati senza risposta
          </p>
        </div>
        <a
          href="/dashboard/email-templates"
          className="rounded-xl border border-[#1b3272] px-3 py-2 text-sm font-semibold text-[#1b3272] hover:bg-slate-50"
        >
          Template
        </a>
      </div>

      <form action={createAction} className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
        <input type="hidden" name="eventId" value={eventId} />
        {selectedRows.map((invitation) => (
          <input key={invitation.id} type="hidden" name="selectedInvitationIds" value={invitation.id} />
        ))}
        <label className="text-sm font-medium text-slate-700">
          Template
          <select name="templateId" className={inputClass} disabled={templates.length === 0}>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Destinatari
          <select name="targetKind" defaultValue="selected" className={inputClass}>
            <option value="selected">Tutti i da invitare</option>
            <option value="selected_rows">Righe selezionate ({selectedRows.length})</option>
            <option value="invited_no_response">Invitati senza risposta</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700 lg:col-span-2">
          Allegati
          <input
            name="attachments"
            type="file"
            multiple
            className="mt-1.5 block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#1b3272] hover:file:bg-slate-200"
          />
        </label>
        <div className="lg:justify-self-end">
          <SubmitButton pending={createPending}>Prepara invio</SubmitButton>
        </div>
      </form>
      <div className="mt-3">
        <ActionMessage state={createState} />
      </div>

      {batches.length > 0 ? (
        <div className="mt-5 space-y-3">
          {batches.map((batch) => {
            const pendingCount = Math.max(
              0,
              batch.recipient_count - batch.sent_count - batch.failed_count - batch.skipped_count,
            );
            return (
              <div key={batch.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      #{batch.id} · {batch.template_name}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {TARGET_LABELS[batch.target_kind]} · {STATUS_LABELS[batch.status]} · {formatDate(batch.created_at)}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {batch.sent_count} inviate · {pendingCount} in coda · {batch.failed_count} errori · {batch.skipped_count} saltate
                    </p>
                    {batch.attachments.length > 0 ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Allegati: {batch.attachments.map((attachment) =>
                          `${attachment.file_name} (${formatBytes(attachment.file_size_bytes)})`,
                        ).join(", ")}
                      </p>
                    ) : null}
                    {batch.last_error ? <p className="mt-1 text-xs text-red-700">{batch.last_error}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {pendingCount > 0 ? <BatchSendForm eventId={eventId} batch={batch} /> : null}
                    {batch.failed_count > 0 ? (
                      <BatchSendForm eventId={eventId} batch={batch} includeFailed />
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
