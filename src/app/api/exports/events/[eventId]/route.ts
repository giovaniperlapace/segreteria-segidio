import { NextRequest, NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { requireManager } from "@/lib/auth/profile";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  loadEventForExport,
  loadNotInvitedContactsForEvent,
  parseEventExportType,
  parseExportFormat,
  sanitizeSearchTerm,
} from "@/lib/exports/data";
import { renderExcel, renderLabelsPdf, renderPdf } from "@/lib/exports/renderers";
import {
  buildEventTable,
  buildNotInvitedTable,
  eventExportTitle,
  eventLabels,
} from "@/lib/exports/tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseEventId(value: string) {
  const eventId = Number(value);
  return Number.isSafeInteger(eventId) && eventId > 0 ? eventId : 0;
}

function filename(value: string, extension: string) {
  const slug = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 90);
  return `${slug || "export"}.${extension}`;
}

function downloadResponse(buffer: Buffer | ArrayBuffer, name: string, contentType: string) {
  const body = buffer instanceof ArrayBuffer
    ? new Uint8Array(buffer)
    : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return new NextResponse(new Blob([body as BlobPart]), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  await requireManager();
  const { eventId: eventIdParam } = await params;
  const eventId = parseEventId(eventIdParam);
  if (!eventId) notFound();

  const supabase = createSupabaseServiceClient();
  const type = parseEventExportType(request.nextUrl.searchParams.get("type") ?? "invitations");
  const format = parseExportFormat(request.nextUrl.searchParams.get("format") ?? "pdf");
  const search = sanitizeSearchTerm(request.nextUrl.searchParams.get("q") ?? "");
  const eventData = await loadEventForExport(supabase, eventId, search);
  if (!eventData) notFound();

  if (type === "not_invited") {
    const { contacts, options } = await loadNotInvitedContactsForEvent(supabase, eventId);
    const table = buildNotInvitedTable(String(eventData.event.title), contacts, options);
    if (format === "xlsx") {
      const xlsx = await renderExcel(table);
      return downloadResponse(
        xlsx,
        filename(table.title, "xlsx"),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
    }
    const pdf = await renderPdf(table);
    return downloadResponse(pdf, filename(table.title, "pdf"), "application/pdf");
  }

  if (type === "labels" && format === "pdf") {
    const pdf = await renderLabelsPdf(eventLabels(eventData.rows), `${eventExportTitle(type)} - ${eventData.event.title}`);
    return downloadResponse(pdf, filename(`${eventExportTitle(type)} ${eventData.event.title}`, "pdf"), "application/pdf");
  }

  const table = buildEventTable(String(eventData.event.title), eventData.rows, type, eventData.options, search);
  if (format === "xlsx") {
    const xlsx = await renderExcel(table);
    return downloadResponse(
      xlsx,
      filename(table.title, "xlsx"),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  }

  const pdf = await renderPdf(table);
  return downloadResponse(pdf, filename(table.title, "pdf"), "application/pdf");
}
