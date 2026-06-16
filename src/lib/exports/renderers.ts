import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

export type ExportColumn<T> = {
  key: string;
  header: string;
  width?: number;
  value: (row: T) => string | number | null | undefined;
};

export type ExportTable<T> = {
  title: string;
  subtitle?: string;
  columns: ExportColumn<T>[];
  rows: T[];
  generatedAt?: Date;
};

function safeText(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function normalizeWorksheetName(value: string) {
  const cleaned = value.replace(/[\[\]*?/\\:]/g, " ").trim() || "Export";
  return cleaned.slice(0, 31);
}

export async function renderExcel<T>(table: ExportTable<T>) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Segreteria Segidio";
  workbook.created = table.generatedAt ?? new Date();
  const worksheet = workbook.addWorksheet(normalizeWorksheetName(table.title), {
    views: [{ state: "frozen", ySplit: 3 }],
  });

  worksheet.mergeCells(1, 1, 1, Math.max(1, table.columns.length));
  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = table.title;
  titleCell.font = { bold: true, size: 16, color: { argb: "FF1B3272" } };
  titleCell.alignment = { vertical: "middle" };

  worksheet.mergeCells(2, 1, 2, Math.max(1, table.columns.length));
  const subtitleCell = worksheet.getCell(2, 1);
  subtitleCell.value = table.subtitle ?? `Generato il ${new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(table.generatedAt ?? new Date())}`;
  subtitleCell.font = { size: 10, color: { argb: "FF64748B" } };

  const headerRow = worksheet.getRow(3);
  headerRow.values = [undefined, ...table.columns.map((column) => column.header)];
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B3272" } };
  headerRow.alignment = { vertical: "middle", wrapText: true };

  for (const row of table.rows) {
    worksheet.addRow(table.columns.map((column) => safeText(column.value(row))));
  }

  worksheet.columns = table.columns.map((column) => ({
    key: column.key,
    width: column.width ?? 24,
  }));
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        bottom: { style: "thin", color: { argb: rowNumber === 3 ? "FFFFFFFF" : "FFE2E8F0" } },
      };
      cell.alignment = { vertical: "top", wrapText: true };
    });
  });
  worksheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: table.columns.length },
  };

  return workbook.xlsx.writeBuffer();
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 3))}...` : value;
}

export function renderPdf<T>(table: ExportTable<T>) {
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({
      size: "A4",
      layout: table.columns.length > 7 ? "landscape" : "portrait",
      margin: 28,
      bufferPages: true,
      info: {
        Title: table.title,
        Author: "Segreteria Segidio",
      },
    });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);

    const pageWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    const top = document.page.margins.top;
    const left = document.page.margins.left;
    const bottom = document.page.height - document.page.margins.bottom;
    const columnWidth = pageWidth / table.columns.length;
    const generatedAt = table.generatedAt ?? new Date();

    function addHeader() {
      document.font("Helvetica-Bold").fontSize(15).fillColor("#1b3272").text(table.title, left, top);
      document
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#64748b")
        .text(
          table.subtitle ??
            `Generato il ${new Intl.DateTimeFormat("it-IT", {
              dateStyle: "short",
              timeStyle: "short",
            }).format(generatedAt)}`,
          left,
          top + 20,
        );
      document.moveTo(left, top + 38).lineTo(left + pageWidth, top + 38).strokeColor("#d9e1f2").stroke();
      return top + 48;
    }

    function addTableHeader(y: number) {
      document.rect(left, y, pageWidth, 20).fill("#1b3272");
      document.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7);
      table.columns.forEach((column, index) => {
        document.text(column.header, left + index * columnWidth + 3, y + 6, {
          width: columnWidth - 6,
          height: 10,
          ellipsis: true,
        });
      });
      return y + 20;
    }

    let y = addTableHeader(addHeader());
    document.font("Helvetica").fontSize(7).fillColor("#0f172a");

    table.rows.forEach((row, rowIndex) => {
      const values = table.columns.map((column) => truncate(safeText(column.value(row)), 140));
      const heights = values.map((value) =>
        document.heightOfString(value || " ", { width: columnWidth - 6, lineGap: 1 }),
      );
      const rowHeight = Math.max(18, Math.min(58, Math.max(...heights) + 8));
      if (y + rowHeight > bottom) {
        document.addPage();
        y = addTableHeader(addHeader());
        document.font("Helvetica").fontSize(7).fillColor("#0f172a");
      }
      if (rowIndex % 2 === 0) {
        document.rect(left, y, pageWidth, rowHeight).fill("#f8fafc");
        document.fillColor("#0f172a");
      }
      values.forEach((value, index) => {
        document.text(value, left + index * columnWidth + 3, y + 5, {
          width: columnWidth - 6,
          height: rowHeight - 8,
          ellipsis: true,
          lineGap: 1,
        });
      });
      document.moveTo(left, y + rowHeight).lineTo(left + pageWidth, y + rowHeight).strokeColor("#e2e8f0").stroke();
      y += rowHeight;
    });

    if (table.rows.length === 0) {
      document.font("Helvetica").fontSize(10).fillColor("#64748b").text("Nessun dato da esportare.", left, y + 12);
    }

    const range = document.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      document.switchToPage(i);
      document
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#64748b")
        .text(`Pagina ${i + 1} di ${range.count}`, left, document.page.height - 24, {
          width: pageWidth,
          align: "right",
        });
    }

    document.end();
  });
}

export function renderLabelsPdf(labels: { title: string; lines: string[] }[], title: string) {
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", margin: 22, bufferPages: true, info: { Title: title } });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);

    const columns = 3;
    const rows = 8;
    const gap = 8;
    const usableWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    const usableHeight = document.page.height - document.page.margins.top - document.page.margins.bottom;
    const labelWidth = (usableWidth - gap * (columns - 1)) / columns;
    const labelHeight = (usableHeight - gap * (rows - 1)) / rows;

    labels.forEach((label, index) => {
      if (index > 0 && index % (columns * rows) === 0) document.addPage();
      const pageIndex = index % (columns * rows);
      const col = pageIndex % columns;
      const row = Math.floor(pageIndex / columns);
      const x = document.page.margins.left + col * (labelWidth + gap);
      const y = document.page.margins.top + row * (labelHeight + gap);
      document.roundedRect(x, y, labelWidth, labelHeight, 4).strokeColor("#cbd5e1").stroke();
      document.font("Helvetica-Bold").fontSize(8).fillColor("#1b3272").text(label.title, x + 6, y + 7, {
        width: labelWidth - 12,
        height: 11,
        ellipsis: true,
      });
      document.font("Helvetica").fontSize(7).fillColor("#0f172a");
      label.lines.slice(0, 5).forEach((line, lineIndex) => {
        document.text(line, x + 6, y + 21 + lineIndex * 10, {
          width: labelWidth - 12,
          height: 9,
          ellipsis: true,
        });
      });
    });

    if (labels.length === 0) {
      document.font("Helvetica").fontSize(10).fillColor("#64748b").text("Nessuna etichetta da stampare.");
    }

    document.end();
  });
}
