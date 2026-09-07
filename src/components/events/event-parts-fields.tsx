"use client";
import { useState } from 'react';
import type { EventPart, PartResponse } from '@/lib/invitations/event-parts';
import { PART_RESPONSE_LABELS } from '@/lib/invitations/event-parts';
const field = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900';
export function EventPartsFields({ initialParts = [] }: { initialParts?: EventPart[] }) {
  const [parts, setParts] = useState(initialParts);
  const [enabled, setEnabled] = useState(parts.length > 0);
  return <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4 md:col-span-2">
    <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={enabled} onChange={e => { setEnabled(e.target.checked); if (e.target.checked && !parts.length) setParts([{ id: crypto.randomUUID(), title: '' }]); }} />Evento composito (più parti)</label>
    <input type="hidden" name="eventParts" value={JSON.stringify(enabled ? parts : [])} />
    {enabled && <><p className="text-sm text-slate-600">Indica le parti nell’ordine desiderato. Per ogni invitato potrai scegliere a quali parti invitarlo.</p>
      {parts.map((part, index) => <div key={part.id} className="flex items-end gap-2"><label className="flex-1 text-sm">Parte {index + 1}<input required maxLength={200} className={field} value={part.title} placeholder={index === 0 ? 'Es. Celebrazione eucaristica' : 'Es. Ricevimento'} onChange={e => setParts(parts.map(p => p.id === part.id ? { ...p, title: e.target.value } : p))} /></label><button type="button" aria-label={`Rimuovi parte ${index + 1}`} disabled={parts.length === 1} onClick={() => setParts(parts.filter(p => p.id !== part.id))} className="p-2 text-sm disabled:opacity-40">Rimuovi</button></div>)}
      <button type="button" disabled={parts.length >= 5} onClick={() => setParts([...parts, { id: crypto.randomUUID(), title: '' }])} className="font-semibold text-[#1b3272] disabled:opacity-40">+ Aggiungi parte</button><p className="text-xs text-slate-500">Fino a cinque parti. Le parti già incluse negli inviti possono essere rinominate, ma non rimosse.</p></>}
  </fieldset>;
}
export function PartSelection({ parts, initialIds }: { parts: EventPart[]; initialIds?: string[] }) {
  const [ids, setIds] = useState(initialIds ?? parts.map(p => p.id));
  if (!parts.length) return null;
  return <fieldset className="space-y-2 rounded-xl border border-slate-200 p-3"><legend className="text-sm font-semibold">Invita a</legend>
    <input type="hidden" name="selectedPartIds" value={JSON.stringify(ids)} />
    <label className="flex gap-2"><input type="checkbox" checked={ids.length === parts.length} onChange={e => setIds(e.target.checked ? parts.map(p => p.id) : [])} />Tutte le parti</label>
    {parts.map(p => <label key={p.id} className="flex gap-2 text-sm"><input type="checkbox" checked={ids.includes(p.id)} onChange={e => setIds(e.target.checked ? [...ids, p.id] : ids.filter(id => id !== p.id))} />{p.title}</label>)}
    {!ids.length && <p className="text-sm text-red-700">Seleziona almeno una parte.</p>}
  </fieldset>;
}
export function PartResponsesFields({ parts, initialResponses, responses, onResponsesChange, manager = false, disabled = false }: { parts: EventPart[]; initialResponses: PartResponse[]; responses?: PartResponse[]; onResponsesChange?: (rows: PartResponse[]) => void; manager?: boolean; disabled?: boolean }) {
  const [internalRows, setInternalRows] = useState(initialResponses);
  const rows = responses ?? internalRows;
  function setRows(nextRows: PartResponse[]) {
    setInternalRows(nextRows);
    onResponsesChange?.(nextRows);
  }
  function change(id: string, patch: Partial<PartResponse>) { setRows(rows.map(row => row.id === id ? { ...row, ...patch } : row)); }
  return <fieldset disabled={disabled} className="space-y-4">
    <input type="hidden" name="partResponses" value={JSON.stringify(rows)} />
    {manager && <p className="text-sm text-slate-600">Seleziona le parti invitate e registra una risposta per ciascuna.</p>}
    {manager && <label className="block text-sm font-medium">Stessa risposta per tutte le parti<select className={field} value={rows.length && rows.every(row => row.response === rows[0].response) && (manager || rows[0].response !== "no_response") ? rows[0].response : ""} onChange={e => { if (e.target.value) setRows(rows.map(row => ({ ...row, response: e.target.value as PartResponse['response'] }))); }}><option value="">Scegli…</option>{Object.entries(PART_RESPONSE_LABELS).filter(([key]) => manager || key !== 'no_response').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
    {parts.map(part => { const row = rows.find(r => r.id === part.id); return <div key={part.id} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="font-semibold">{manager && <input aria-label={`Invita a ${part.title}`} type="checkbox" className="mr-2" checked={Boolean(row)} onChange={e => setRows(e.target.checked ? [...rows, { id: part.id, response: 'no_response' }] : rows.filter(r => r.id !== part.id))} />}{part.title}</div>
      {row && <><label className="block text-sm">Risposta<select className={field} value={row.response === 'no_response' && !manager ? '' : row.response} required onChange={e => change(part.id, { response: e.target.value as PartResponse['response'] })}>{!manager && <option value="" disabled>Scegli una risposta</option>}{Object.entries(PART_RESPONSE_LABELS).filter(([key]) => manager || key !== 'no_response').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        {row.response === 'delegated' && <div className="grid gap-3 sm:grid-cols-2">{(['firstName', 'lastName', 'email', 'role'] as const).map(key => <label key={key} className="text-sm">{{ firstName: 'Nome delegato', lastName: 'Cognome delegato', email: 'Email delegato', role: 'Ruolo/Carica (facoltativo)' }[key]}<input type={key === 'email' ? 'email' : 'text'} required={key !== 'role'} maxLength={key === 'email' ? 320 : 200} value={row[key] ?? ''} className={field} onChange={e => change(part.id, { [key]: e.target.value })} /></label>)}<p className="text-xs text-slate-500 sm:col-span-2">Il delegato resta legato a questo evento e non entra nell’archivio contatti.</p></div>}</>}
    </div>; })}
  </fieldset>;
}
