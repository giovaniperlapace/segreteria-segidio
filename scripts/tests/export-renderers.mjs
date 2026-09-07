// Run with: node scripts/tests/export-renderers.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import ts from 'typescript';
import ExcelJS from 'exceljs';
const filename = path.resolve('src/lib/exports/renderers.ts');
const renderer = new Module(filename);
renderer.filename = filename;
renderer.paths = Module._nodeModulePaths(path.dirname(filename));
renderer._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText, filename);
(async () => {
  const table = {
    title: 'Invitati per gruppo - Preghiera per la pace',
    columns: [
      { key: 'group', header: 'Gruppi', value: row => row.group },
      { key: 'lastName', header: 'Cognome', value: row => row.lastName },
      { key: 'firstName', header: 'Nome', value: row => row.firstName },
      { key: 'total', header: 'Totale', value: row => row.total },
    ],
    rows: Array.from({ length: 100 }, () => ({ group: 'Ambasciate', lastName: 'Rossi', firstName: 'Maria', total: 2 })),
  };
  const xlsx = await renderer.exports.renderExcel(table);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsx);
  const sheet = workbook.worksheets[0];
  assert.deepEqual(sheet.getRow(3).values.slice(1), ['Gruppi', 'Cognome', 'Nome', 'Totale']);
  assert.deepEqual(sheet.getRow(4).values.slice(1), ['Ambasciate', 'Rossi', 'Maria', 2]);
  assert.equal(sheet.autoFilter, 'A3:D103');
  assert.equal(sheet.views[0].ySplit, 3);
  const pdf = await renderer.exports.renderPdf(table);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 3, 'Footers must not generate extra pages');
  const labels = await renderer.exports.renderLabelsPdf(Array.from({ length: 25 }, () => ({ title: 'Maria Rossi', lines: ['Ambasciata'] })), 'Etichette');
  assert.equal((labels.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 2);
  if (process.env.EXPORT_QA_DIR) {
    fs.writeFileSync(path.join(process.env.EXPORT_QA_DIR, 'segidio-export.pdf'), pdf);
    fs.writeFileSync(path.join(process.env.EXPORT_QA_DIR, 'segidio-export.xlsx'), Buffer.from(xlsx));
  }
  console.log('PASS: Excel alignment, numeric values, filters, frozen headers; PDF pagination and labels.');
})().catch(error => { console.error(error); process.exitCode = 1; });
