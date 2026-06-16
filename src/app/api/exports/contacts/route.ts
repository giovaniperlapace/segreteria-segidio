import { NextRequest, NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  loadContactsForExport,
  loadExportOptions,
  parseContactExportType,
  parseExportFormat,
} from "@/lib/exports/data";
import { renderExcel, renderLabelsPdf, renderPdf } from "@/lib/exports/renderers";
import { buildContactsTable, contactExportTitle, contactLabels } from "@/lib/exports/tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function filename(value: string, extension: string) {
  const slug = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
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

export async function GET(request: NextRequest) {
  const profile = await requireProfile();
  const supabase =
    profile.role === "manager"
      ? createSupabaseServiceClient()
      : await createSupabaseServerClient();
  const type = parseContactExportType(request.nextUrl.searchParams.get("type") ?? "list");
  const format = parseExportFormat(request.nextUrl.searchParams.get("format") ?? "pdf");

  const [{ contacts, filters }, options] = await Promise.all([
    loadContactsForExport(supabase, request.nextUrl.searchParams),
    loadExportOptions(supabase),
  ]);

  if (type === "labels" && format === "pdf") {
    const pdf = await renderLabelsPdf(contactLabels(contacts), contactExportTitle(type));
    return downloadResponse(pdf, filename(contactExportTitle(type), "pdf"), "application/pdf");
  }

  const table = buildContactsTable(contacts, type, options, filters);
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
