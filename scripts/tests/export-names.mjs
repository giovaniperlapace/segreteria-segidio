// Run: node scripts/tests/export-names.mjs
// Set EXPORT_QA_DIR to an existing directory to save PDF samples for visual review.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import ts from 'typescript';
import ExcelJS from 'exceljs';

const cache = new Map();
function loadTypeScript(filename) {
  filename = path.resolve(filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  cache.set(filename, loaded);
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = (specifier) => {
    const target = specifier.startsWith('@/')
      ? path.resolve('src', specifier.slice(2))
      : specifier.startsWith('.') ? path.resolve(path.dirname(filename), specifier) : null;
    if (target && fs.existsSync(`${target}.ts`)) return loadTypeScript(`${target}.ts`);
    return originalRequire(specifier);
  };
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true },
  }).outputText, filename);
  return loaded.exports;
}


const tables = loadTypeScript('src/lib/exports/tables.ts');
const render = loadTypeScript('src/lib/exports/renderers.ts');
const contact = { id: 1, first_name: 'Maria Luisa', last_name: 'De Rossi', institution: 'Ambasciata',
  country: 'Italia', group_ids: [], reference_ids: [], missing_fields: ['email'], status: 'active', priority: 'standard' };
const row = { contact, contactName: 'Maria Luisa De Rossi', rowType: 'invitation', invitationStatus: 'invited',
  responseStatus: 'attending', companionCount: 0, approvalReferences: [], partResponses: [] };
const options = { groups: [], references: [] };
const filters = { groupIds: [], referenceIds: [], status: 'active', priority: 'all', missing: 'all' };
const cases = [tables.buildNotInvitedTable('Evento', [contact], options),
  ...['list', 'missing'].map(type => tables.buildContactsTable([contact], type, options, filters)),
  ...['invitations', 'invitations_by_group', 'responses', 'participants', 'followup', 'proposals'].map(type =>
    tables.buildEventTable('Evento', [{ ...row, rowType: type === 'proposals' ? 'proposal' : 'invitation',
      responseStatus: type === 'followup' ? 'no_response' : 'attending' }], type, options))];
for (const table of cases) {
  assert.equal(table.rows.length, 1);
  const first = table.columns.findIndex(c => c.header === 'Nome');
  const last = table.columns.findIndex(c => c.header === 'Cognome');
  assert.ok(first >= 0 && last >= 0 && first !== last, table.title);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await render.renderExcel(table, { simpleLayout: true }));
  assert.equal(workbook.worksheets[0].getCell(2, first + 1).value, 'Maria Luisa');
  assert.equal(workbook.worksheets[0].getCell(2, last + 1).value, 'De Rossi');
  const pdf = await render.renderPdf(table);
  assert.equal(pdf.subarray(0,5).toString(), '%PDF-');
  if (process.env.EXPORT_QA_DIR) fs.writeFileSync(path.join(process.env.EXPORT_QA_DIR, `${cases.indexOf(table)}.pdf`), pdf);
}
const value = (table, key) => table.columns.find(column => column.key === key).value(table.rows[0]);
const delegate = { ...row, delegateEmail: 'delegate@example.test', delegateFirstName: 'Anna Maria', delegateLastName: 'Di Luca' };
let table = tables.buildEventTable('Evento', [delegate], 'participants', options);
assert.equal(value(table, 'first_name'), 'Anna Maria');
assert.equal(value(table, 'last_name'), 'Di Luca');
assert.equal(value(table, 'original_first_name'), 'Maria Luisa');
assert.equal(value(table, 'original_last_name'), 'De Rossi');
table = tables.buildEventTable('Evento', [{ ...row, partResponses: [
  { id: 'a', response: 'delegated', firstName: 'Anna', lastName: 'Rossi', email: 'a@example.test' },
  { id: 'b', response: 'delegated', firstName: 'Anna', lastName: 'Bianchi', email: 'b@example.test' },
  { id: 'c', response: 'delegated', firstName: 'Anna', lastName: 'Rossi', email: 'a@example.test' },
  { id: 'd', response: 'attending' },
] }], 'participants', options);
assert.equal(value(table, 'first_name'), 'Anna\nAnna\nMaria Luisa');
assert.equal(value(table, 'last_name'), 'Rossi\nBianchi\nDe Rossi');
for (const labels of [tables.contactLabels([contact]), tables.eventLabels([row])]) {
  assert.equal(labels[0].firstName, 'Maria Luisa');
  assert.equal(labels[0].lastName, 'De Rossi');
  assert.ok(labels[0].lines.includes('Italia'));
  const pdf = await render.renderLabelsPdf(labels, 'Etichette');
  if (process.env.EXPORT_QA_DIR) fs.writeFileSync(path.join(process.env.EXPORT_QA_DIR, 'labels.pdf'), pdf);
}
console.log('PASS: separate name/surname in all list tables, Excel cells, compound names, delegates, aligned composite participants and labels.');
