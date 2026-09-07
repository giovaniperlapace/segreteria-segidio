"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PartResponsesFields } from '@/components/events/event-parts-fields';
import { describeParts, type EventPart, type PartResponse } from '@/lib/invitations/event-parts';
import { updateCompositeInvitationAction } from '../actions';
import { useArchiveAction, SubmitButton, ActionMessage, inputClass } from '../../archive-ui';
import type { EventInvitationRecord } from './invitation-management';
export function CompositeInvitationEditor({ invitation, parts }: { invitation: EventInvitationRecord; parts: EventPart[] }) {
  const [state, action, pending] = useArchiveAction(updateCompositeInvitationAction);
  const router = useRouter();
  useEffect(() => { if (state.status === 'success') router.refresh(); }, [state, router]);
  return <div className="space-y-4"><form action={action} className="space-y-4">
    <input type="hidden" name="eventId" value={invitation.event_id} /><input type="hidden" name="invitationId" value={invitation.id} />
    <label className="block text-sm">Stato invito<select name="invitationStatus" defaultValue={invitation.invitation_status} className={inputClass}><option value="draft">Bozza</option><option value="proposed">Proposto</option><option value="selected">Da invitare</option><option value="invited">Invitato</option><option value="excluded">Escluso</option></select></label>
    <p className="text-xs text-slate-600">Le risposte vengono registrate solo con lo stato Invitato. Negli altri stati le parti selezionate restano senza risposta.</p>
    <PartResponsesFields parts={parts} initialResponses={invitation.part_responses ?? []} manager />
    <label className="block text-sm">Note<input name="notes" defaultValue={invitation.notes ?? ''} className={inputClass} /></label>
    <label className="flex gap-2 text-sm"><input type="checkbox" name="attentionFlag" defaultChecked={invitation.attention_flag} />Da tenere in evidenza</label>
    <SubmitButton pending={pending}>Salva invito</SubmitButton><ActionMessage state={state} />
  </form>
  <details className="rounded-xl border p-3"><summary className="cursor-pointer font-semibold">Storico risposte</summary>{invitation.response_history.map(h => <div key={h.id} className="mt-3 border-t pt-3 text-sm"><p>{new Date(h.recorded_at).toLocaleString('it-IT')} · {h.source === 'public_link' ? 'Ricevuta dal partecipante' : h.actor_name ?? 'Segreteria'}</p><p className="whitespace-pre-line">{describeParts((h.part_responses ?? []).map((r: PartResponse & { title?: string }) => ({ id: r.id, title: r.title ?? parts.find(p => p.id === r.id)?.title ?? r.id })), h.part_responses ?? [])}</p></div>)}</details>
  </div>;
}
