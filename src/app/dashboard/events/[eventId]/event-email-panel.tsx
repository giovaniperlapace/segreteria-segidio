"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ActionMessage, inputClass, PendingSpinner, SubmitButton, useArchiveAction } from "../../archive-ui";
import {
  getEmailBatchPreviewAction,
  type EmailBatchPreviewMessage,
  type EmailDeliveryStatus,
} from "../email-preview-actions";
import {
  createEmailBatchAction,
  deleteEmailBatchAction,
  sendEmailBatchAction,
} from "../email-actions";
import type { EventInvitationRecord } from "./invitation-management";

export type EventEmailTemplateOption = {
  id: number;
  name: string;
  subject: string;
};

export type EventEmailBatchRecord = {
  id: number;
  status: "draft" | "queued" | "sending" | "completed" | "completed_with_errors";
  target_kind:
    | "selected"
    | "selected_rows"
    | "invited_no_response"
    | "participants"
    | "all_invited";
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  include_public_response_link: boolean;
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
  participants: "Partecipanti",
  all_invited: "Tutti gli invitati",
};

const STATUS_LABELS: Record<EventEmailBatchRecord["status"], string> = {
  draft: "Bozza",
  queued: "In coda",
  sending: "Invio",
  completed: "Completato",
  completed_with_errors: "Con errori",
};

const DELIVERY_STATUS_LABELS: Record<EmailBatchPreviewMessage["status"], string> = {
  queued: "Da inviare",
  sending: "Invio in corso",
  sent: "Inviata",
  failed: "Errore",
  skipped: "Saltata",
};

const AUTO_CONTINUE_DELAY_MS = 5000;

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

function BatchActions({
  eventId,
  batch,
  pendingCount,
  canDelete,
}: {
  eventId: number;
  batch: EventEmailBatchRecord;
  pendingCount: number;
  canDelete: boolean;
}) {
  const [state, action, pending] = useArchiveAction(sendEmailBatchAction);
  const [autoContinue, setAutoContinue] = useState(false);
  const sendFormRef = useRef<HTMLFormElement>(null);
  const canChangeResponseLink =
    batch.status !== "sending" && batch.sent_count === 0 && batch.failed_count === 0;
  const canSend = pendingCount > 0 || batch.failed_count > 0;
  const sendFormId = `email-batch-send-${batch.id}`;

  useEffect(() => {
    if (!autoContinue || pending || state.status === "idle") return;
    if (state.status === "error" || state.batchId !== batch.id) {
      const timeoutId = window.setTimeout(() => setAutoContinue(false), 0);
      return () => window.clearTimeout(timeoutId);
    }
    if (!state.remainingCount) {
      const timeoutId = window.setTimeout(() => setAutoContinue(false), 0);
      return () => window.clearTimeout(timeoutId);
    }

    const timeoutId = window.setTimeout(() => {
      sendFormRef.current?.requestSubmit();
    }, AUTO_CONTINUE_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [autoContinue, batch.id, pending, state]);

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap items-start gap-2 sm:justify-end">
        <BatchPreviewButton eventId={eventId} batch={batch} />
        {pendingCount > 0 ? (
          <button
            type="submit"
            form={sendFormId}
            disabled={pending || autoContinue}
            aria-busy={pending || autoContinue}
            className="inline-flex items-center gap-2 rounded-xl bg-[#1b3272] px-3 py-2 text-sm font-semibold text-white hover:bg-[#263f86] disabled:cursor-wait disabled:opacity-60"
          >
            {pending || autoContinue ? <PendingSpinner /> : null}
            {autoContinue ? "Invio automatico..." : "Invia tutte"}
          </button>
        ) : null}
        {batch.failed_count > 0 ? (
          <button
            type="submit"
            form={sendFormId}
            name="includeFailed"
            value="on"
            disabled={pending || autoContinue}
            className="inline-flex items-center gap-2 rounded-xl bg-[#1b3272] px-3 py-2 text-sm font-semibold text-white hover:bg-[#263f86] disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? <PendingSpinner /> : null}
            Ritenta errori
          </button>
        ) : null}
        {canDelete ? <BatchDeleteForm eventId={eventId} batch={batch} /> : null}
      </div>
      {canSend ? (
        <form
          ref={sendFormRef}
          id={sendFormId}
          action={action}
          className="space-y-2"
          onSubmit={(event) => {
            const submitter = (event.nativeEvent as SubmitEvent).submitter;
            if (!(submitter instanceof HTMLButtonElement) || submitter.name !== "includeFailed") {
              setAutoContinue(true);
            }
          }}
        >
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="batchId" value={batch.id} />
          {!canChangeResponseLink && !batch.include_public_response_link ? (
            <input type="hidden" name="omitPublicResponseLink" value="on" />
          ) : null}
          <label className="flex max-w-sm items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="omitPublicResponseLink"
              defaultChecked={!batch.include_public_response_link}
              disabled={!canChangeResponseLink || pending}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#1b3272]"
            />
            <span>
              Invia senza il pulsante per comunicare la partecipazione
              {!canChangeResponseLink ? " (impostazione bloccata dopo il primo invio)" : ""}
            </span>
          </label>
          <ActionMessage state={state} />
        </form>
      ) : null}
    </div>
  );
}

function BatchDeleteForm({
  eventId,
  batch,
}: {
  eventId: number;
  batch: EventEmailBatchRecord;
}) {
  const [state, action, pending] = useArchiveAction(deleteEmailBatchAction);

  return (
    <form
      action={action}
      className="space-y-2"
      onSubmit={(event) => {
        if (!window.confirm(`Eliminare il blocco email #${batch.id}?`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="batchId" value={batch.id} />
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? <PendingSpinner /> : null}
        {pending ? "Eliminazione..." : "Elimina blocco"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

function BatchRecipientsButton({
  eventId,
  batch,
  count,
  label,
  statuses,
}: {
  eventId: number;
  batch: EventEmailBatchRecord;
  count: number;
  label: string;
  statuses: EmailDeliveryStatus[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<EmailBatchPreviewMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  async function openRecipients() {
    setOpen(true);
    if (messages.length > 0 || loading) return;
    setLoading(true);
    setError("");
    const result = await getEmailBatchPreviewAction(eventId, batch.id, statuses);
    if (result.status === "error") {
      setError(result.message);
    } else {
      setMessages(result.messages);
      setTotal(result.total);
    }
    setLoading(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={openRecipients}
        className="rounded-sm underline decoration-slate-300 underline-offset-2 hover:text-[#1b3272] hover:decoration-[#1b3272] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1b3272]"
        aria-label={`${label}: mostra i destinatari`}
      >
        {count} {label}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`email-batch-recipients-title-${batch.id}-${statuses.join("-")}`}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-[#d9e1f2] bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id={`email-batch-recipients-title-${batch.id}-${statuses.join("-")}`}
                  className="text-xl font-semibold text-[#1b3272]"
                >
                  {label.charAt(0).toUpperCase() + label.slice(1)} · blocco #{batch.id}
                </h2>
                <p className="mt-1 text-sm text-slate-600">{batch.template_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Chiudi
              </button>
            </div>

            {loading ? (
              <p className="mt-6 flex items-center gap-2 text-sm text-slate-600">
                <PendingSpinner /> Caricamento destinatari...
              </p>
            ) : error ? (
              <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            ) : messages.length > 0 ? (
              <div className="mt-5">
                {total > messages.length ? (
                  <p className="mb-3 text-xs text-amber-700">
                    Sono mostrati i primi {messages.length} destinatari su {total}.
                  </p>
                ) : null}
                <ul className="max-h-[60vh] divide-y divide-slate-200 overflow-y-auto rounded-xl border border-slate-200">
                  {messages.map((message) => (
                    <li key={message.id} className="p-3 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900">{message.contact_name}</p>
                          <p className="break-all text-slate-600">{message.to_email}</p>
                          {message.institution ? (
                            <p className="text-xs text-slate-500">{message.institution}</p>
                          ) : null}
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                          {DELIVERY_STATUS_LABELS[message.status]}
                        </span>
                      </div>
                      {message.error_message ? (
                        <p className="mt-2 text-xs text-red-700">{message.error_message}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-6 text-sm text-slate-600">Nessun destinatario in questo stato.</p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function BatchPreviewButton({
  eventId,
  batch,
}: {
  eventId: number;
  batch: EventEmailBatchRecord;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<EmailBatchPreviewMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const selectedMessage =
    messages.find((message) => message.id === selectedMessageId) ?? messages[0] ?? null;

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  async function openPreview() {
    setOpen(true);
    if (messages.length > 0 || loading) return;
    setLoading(true);
    setError("");
    const result = await getEmailBatchPreviewAction(eventId, batch.id);
    if (result.status === "error") {
      setError(result.message);
    } else {
      setMessages(result.messages);
      setTotal(result.total);
      setSelectedMessageId(result.messages[0]?.id ?? null);
    }
    setLoading(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={openPreview}
        className="inline-flex items-center gap-2 rounded-xl border border-[#1b3272] bg-white px-3 py-2 text-sm font-semibold text-[#1b3272] hover:bg-slate-100"
      >
        Vedi testo
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`email-batch-preview-title-${batch.id}`}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl border border-[#d9e1f2] bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id={`email-batch-preview-title-${batch.id}`} className="text-xl font-semibold text-[#1b3272]">
                  Testo email · blocco #{batch.id}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {batch.sent_count > 0 ? "Messaggi preparati e già inviati" : "Messaggi preparati da inviare"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Chiudi
              </button>
            </div>

            {loading ? (
              <p className="mt-6 flex items-center gap-2 text-sm text-slate-600">
                <PendingSpinner /> Caricamento testo...
              </p>
            ) : error ? (
              <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            ) : selectedMessage ? (
              <div className="mt-5 space-y-4">
                {messages.length > 1 ? (
                  <label className="block text-sm font-medium text-slate-700">
                    Destinatario
                    <select
                      value={selectedMessage.id}
                      onChange={(event) => setSelectedMessageId(Number(event.target.value))}
                      className={inputClass}
                    >
                      {messages.map((message, index) => (
                        <option key={message.id} value={message.id}>
                          {index + 1}. {message.to_email} · {DELIVERY_STATUS_LABELS[message.status]}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {total > messages.length ? (
                  <p className="text-xs text-amber-700">
                    Sono mostrati i primi {messages.length} messaggi su {total}.
                  </p>
                ) : null}
                <dl className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-[8rem_1fr]">
                  <dt className="font-semibold text-slate-700">Destinatario</dt>
                  <dd className="break-all text-slate-900">{selectedMessage.to_email}</dd>
                  <dt className="font-semibold text-slate-700">Stato</dt>
                  <dd className="text-slate-900">
                    {DELIVERY_STATUS_LABELS[selectedMessage.status]}
                    {selectedMessage.sent_at ? ` · ${formatDate(selectedMessage.sent_at)}` : ""}
                  </dd>
                  <dt className="font-semibold text-slate-700">Oggetto</dt>
                  <dd className="text-slate-900">{selectedMessage.subject}</dd>
                </dl>
                {selectedMessage.error_message ? (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {selectedMessage.error_message}
                  </p>
                ) : null}
                <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 font-sans text-sm leading-6 text-slate-900">
                  {selectedMessage.rendered_text}
                </pre>
              </div>
            ) : (
              <p className="mt-6 text-sm text-slate-600">Nessun messaggio presente in questo blocco.</p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function BatchCard({
  eventId,
  batch,
}: {
  eventId: number;
  batch: EventEmailBatchRecord;
}) {
  const pendingCount = Math.max(
    0,
    batch.recipient_count - batch.sent_count - batch.failed_count - batch.skipped_count,
  );
  const canDelete =
    batch.status !== "sending" && batch.sent_count === 0 && batch.failed_count === 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">
            #{batch.id} · {batch.template_name}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {TARGET_LABELS[batch.target_kind]} · {STATUS_LABELS[batch.status]} · {formatDate(batch.created_at)}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-1 text-sm text-slate-600">
            <BatchRecipientsButton eventId={eventId} batch={batch} count={batch.sent_count} label="inviate" statuses={["sent"]} />
            <span aria-hidden="true">·</span>
            <BatchRecipientsButton eventId={eventId} batch={batch} count={pendingCount} label="in coda" statuses={["queued", "sending"]} />
            <span aria-hidden="true">·</span>
            <BatchRecipientsButton eventId={eventId} batch={batch} count={batch.failed_count} label="errori" statuses={["failed"]} />
            <span aria-hidden="true">·</span>
            <BatchRecipientsButton eventId={eventId} batch={batch} count={batch.skipped_count} label="saltate" statuses={["skipped"]} />
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {batch.attachments.length > 0
              ? `Allegati (${batch.attachments.length}): ${batch.attachments.map((attachment) =>
                  `${attachment.file_name} (${formatBytes(attachment.file_size_bytes)})`,
                ).join(", ")}`
              : "Allegati: nessuno"}
          </p>
          {batch.last_error ? <p className="mt-1 text-xs text-red-700">{batch.last_error}</p> : null}
        </div>
        <BatchActions
          eventId={eventId}
          batch={batch}
          pendingCount={pendingCount}
          canDelete={canDelete}
        />
      </div>
    </div>
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
  const [showCompletedBatches, setShowCompletedBatches] = useState(false);
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
  const activeBatches = batches.filter((batch) => {
    const pendingCount = Math.max(
      0,
      batch.recipient_count - batch.sent_count - batch.failed_count - batch.skipped_count,
    );
    return pendingCount > 0 || batch.failed_count > 0 || batch.status === "draft" || batch.status === "sending";
  });
  const completedBatches = batches.filter((batch) => !activeBatches.includes(batch));

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
            <option value="participants">Tutti i partecipanti</option>
            <option value="all_invited">Tutti gli invitati</option>
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
          {activeBatches.map((batch) => (
            <BatchCard key={batch.id} eventId={eventId} batch={batch} />
          ))}
          {activeBatches.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Nessun blocco ancora da inviare.
            </p>
          ) : null}
          {completedBatches.length > 0 ? (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowCompletedBatches((value) => !value)}
                className="text-sm font-semibold text-[#1b3272] underline decoration-slate-300 underline-offset-4 hover:decoration-[#1b3272]"
                aria-expanded={showCompletedBatches}
              >
                {showCompletedBatches
                  ? "Nascondi gli invii conclusi"
                  : `Altro… (${completedBatches.length} ${completedBatches.length === 1 ? "invio concluso" : "invii conclusi"})`}
              </button>
            </div>
          ) : null}
          {showCompletedBatches ? (
            <div className="space-y-3 border-t border-slate-200 pt-3">
              {completedBatches.map((batch) => (
                <BatchCard key={batch.id} eventId={eventId} batch={batch} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
