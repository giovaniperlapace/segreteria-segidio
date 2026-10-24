"use client";

import { useRef, useState } from "react";
import { previewPersonalizedBadgeAction } from "../email-actions";
import { badgePreviewForm } from "@/lib/email/badge-preview-form";
import { prepareBadgeImage } from "@/lib/email/prepare-badge-image";

const initialLayout = { firstX: 50, firstY: 87, lastX: 50, lastY: 93, fontSize: 5 };
type Layout = typeof initialLayout;
const buttonClass = "rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-[#1b3272] disabled:opacity-50";

export function PersonalizedBadgeEditor({ audienceKey }: { audienceKey: string }) {
  const root = useRef<HTMLFieldSetElement>(null);
  const request = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const [hasFile, setHasFile] = useState(false);
  const [layout, setLayout] = useState(initialLayout);
  const [image, setImage] = useState("");
  const [label, setLabel] = useState("");
  const [proof, setProof] = useState("");
  const [previewAudience, setPreviewAudience] = useState("");
  const [validated, setValidated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [resized, setResized] = useState(false);
  const [positionField, setPositionField] = useState<"first" | "last">("first");
  const valid = validated && previewAudience === audienceKey && Boolean(proof);

  function invalidate() {
    request.current += 1;
    setValidated(false); setProof(""); setError(""); setImage("");
  }
  async function preview(realNames: boolean, nextLayout = layout) {
    const form = root.current?.form;
    if (!form) return;
    const id = ++request.current;
    setBusy(true); setError(""); setValidated(false); setProof("");
    let data: FormData;
    try { data = badgePreviewForm(new FormData(form), realNames, nextLayout); }
    catch (error) { setError(error instanceof Error ? error.message : "Controlla il file del badge."); setBusy(false); return; }
    try {
      const result = await previewPersonalizedBadgeAction(data, realNames);
      if (id !== request.current) return;
      if (result.status === "error") { setError(result.message); setImage(""); }
      else { setImage(result.image); setLabel(result.label); setProof(result.proof); setPreviewAudience(audienceKey); }
    } catch { setError("Impossibile generare l’anteprima. Riprova."); }
    finally { setBusy(false); }
  }
  function change(key: keyof Layout, value: number) {
    invalidate(); setLayout(current => ({ ...current, [key]: value }));
  }
  return <fieldset ref={root} className="h-full min-w-0 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <legend className="px-1 font-semibold text-[#1b3272]">Badge personalizzato</legend>
    <input ref={fileInput} aria-label="Immagine JPG del badge" type="file" accept="image/jpeg,.jpg,.jpeg" name="badgeImage" disabled={busy || preparing} onChange={async event => {
      invalidate(); setLayout(initialLayout);
      const input = event.currentTarget;
      const file = input.files?.[0];
      setResized(false); setHasFile(false);
      if (!file) return;
      const id = request.current;
      setPreparing(true);
      try {
        const prepared = await prepareBadgeImage(file);
        if (id !== request.current) return;
        if (prepared !== file) {
          const transfer = new DataTransfer(); transfer.items.add(prepared); input.files = transfer.files;
          setResized(true);
        }
        setHasFile(true);
      } catch (error) {
        input.value = "";
        setError(error instanceof Error ? error.message : "Impossibile leggere il JPG. Prova a salvarlo nuovamente.");
      } finally { setPreparing(false); }
    }} className="block w-full min-w-0 rounded-lg text-sm text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1b3272] file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-[#1b3272] file:px-4 file:py-2.5 file:font-semibold file:text-white file:shadow-sm file:transition file:duration-150 hover:file:bg-[#263f86] active:file:translate-y-0.5 active:file:scale-95 active:file:shadow-none motion-reduce:file:transition-none disabled:opacity-50" />
    {preparing && <p role="status" className="text-sm">Preparazione del JPG…</p>}
    {resized && <p role="status" className="text-sm text-slate-600">JPG ridimensionato automaticamente per il caricamento.</p>}
    <input type="hidden" name="badgeEnabled" value={hasFile || preparing ? "on" : "off"} />
    <input type="hidden" name="badgeLayout" value={JSON.stringify(layout)} />
    <input type="hidden" name="badgeProof" value={valid ? proof : ""} />
    {hasFile && <>
      <button type="button" disabled={busy} className={buttonClass} onClick={() => {
        if (fileInput.current) fileInput.current.value = "";
        invalidate(); setHasFile(false);
      }}>Rimuovi badge</button>
      <div className="grid gap-4 sm:grid-cols-2">
        {([
          ["firstX", "Nome: posizione orizzontale"], ["firstY", "Nome: posizione verticale"],
          ["lastX", "Cognome: posizione orizzontale"], ["lastY", "Cognome: posizione verticale"],
          ["fontSize", "Dimensione del testo"],
        ] as const).map(([key, title]) => <label key={key} className="text-sm text-slate-700">{title}: {layout[key]}%
          <input aria-label={title} type="range" min={key === "fontSize" ? 1 : 5} max={key === "fontSize" ? 12 : 95} step="0.5" value={layout[key]} disabled={busy} onChange={event => change(key, Number(event.target.value))} className="mt-2 block w-full" />
        </label>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass} disabled={busy} onClick={() => preview(false)}>1. Anteprima segnaposti</button>
        <button type="button" className={buttonClass} disabled={busy} onClick={() => preview(true)}>2. Mostra primo destinatario</button>
        <button type="button" className={buttonClass} disabled={busy || !proof || previewAudience !== audienceKey} onClick={() => setValidated(true)}>3. Validare</button>
      </div>
      {busy && <p role="status" className="text-sm">Generazione anteprima…</p>}
      {image && <div className="space-y-2">
        <p className="text-sm font-medium">{label}</p>
        <label className="block text-sm">Clicca sull’immagine per riposizionare il campo:
          <select value={positionField} onChange={event => setPositionField(event.target.value as "first" | "last")} className="ml-2 rounded border p-1"><option value="first">Nome</option><option value="last">Cognome</option></select>
        </label>
        <button type="button" disabled={busy} aria-label="Posiziona il campo sul badge; in alternativa usa i cursori sopra" className="block max-w-full cursor-crosshair" onClick={event => {
          if (event.detail === 0) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const clamp = (n: number) => Math.max(5, Math.min(95, Math.round(n * 2) / 2));
          const next = { ...layout, [`${positionField}X`]: clamp((event.clientX - bounds.left) / bounds.width * 100), [`${positionField}Y`]: clamp((event.clientY - bounds.top) / bounds.height * 100) };
          setLayout(next); void preview(false, next);
        }}>
          {/* The exact server-generated JPEG is also used for email attachments. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt={`Anteprima badge: ${label}`} className="h-auto max-h-[620px] max-w-full rounded border object-contain" />
        </button>
      </div>}
      <p role="status" className={`text-sm ${valid ? "text-green-700" : "text-amber-800"}`}>{valid ? "Badge validato: pronto per preparare l’invio." : "Prima di preparare l’invio, controlla il primo destinatario e premi Validare."}</p>
      <p className="text-xs text-slate-500">I JPG oltre 4 MB vengono ridimensionati automaticamente (massimo 30 MB e 24 milioni di pixel). I nomi lunghi vengono ridotti per rientrare nell’immagine. Badge e allegati comuni: massimo 6 MB per email. Modifiche alla selezione richiedono una nuova validazione.</p>
    </>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </fieldset>;
}
