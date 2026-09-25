import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/auth/profile";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { loadAllCandidates, type CandidateExportContact, type SearchParams } from "@/lib/exports/candidates";
import { renderExcel, renderPdf, type ExportTable } from "@/lib/exports/renderers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  await requireManager();
  const eventId = Number((await params).eventId);
  if (!Number.isSafeInteger(eventId) || eventId <= 0) return NextResponse.json({ error: "Evento non valido" }, { status: 400 });
  const format = request.nextUrl.searchParams.get("format");
  if (format !== "xlsx" && format !== "pdf") return NextResponse.json({ error: "Formato non valido" }, { status: 400 });
  const supabase = createSupabaseServiceClient();
  const { data: event, error } = await supabase.from("events").select("title").eq("id", eventId).maybeSingle();
  if (error) throw error;
  if (!event) return NextResponse.json({ error: "Evento non trovato" }, { status: 404 });
  const query: SearchParams = {};
  for (const key of request.nextUrl.searchParams.keys()) query[key] = request.nextUrl.searchParams.getAll(key);
  const rows = await loadAllCandidates(supabase, eventId, query);
  const table: ExportTable<CandidateExportContact> = {
    title: "Persone da invitare",
    subtitle: `${event.title} · ${rows.length} candidati filtrati · esclusi i contatti già in lista evento`,
    rows,
    columns: [
      { key: "first_name", header: "Nome", width: 24, value: (row) => row.firstName },
      { key: "last_name", header: "Cognome", width: 24, value: (row) => row.lastName },
      { key: "detail", header: "Carica / Istituzione", width: 40, value: (row) => row.detail },
      { key: "email", header: "Email", width: 30, value: (row) => row.email },
      { key: "country", header: "Paese", width: 20, value: (row) => row.country },
      { key: "status", header: "Stato", width: 14, value: (row) => row.status === "active" ? "Attivo" : "Non attivo" },
      { key: "priority", header: "Priorità", width: 14, value: (row) => row.priority },
      { key: "groups", header: "Gruppi", width: 28, value: (row) => row.groups.join(", ") },
      { key: "references", header: "Referenti", width: 28, value: (row) => row.references.join(", ") },
      { key: "missing", header: "Stato dati", width: 35, value: (row) => row.missingFields.length ? `Mancano: ${row.missingFields.join(", ")}` : "Completi" },
      { key: "proposals", header: "Proposte", width: 30, value: (row) => row.proposalSummary },
    ],
  };
  const buffer = format === "xlsx" ? await renderExcel(table) : await renderPdf(table, { fullText: true });
  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
      "Content-Disposition": `attachment; filename="persone-da-invitare-evento-${eventId}.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}
