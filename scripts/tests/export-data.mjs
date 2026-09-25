// Offline regression: node scripts/tests/export-data.mjs
// Optional read-only checks against the configured database:
// node --env-file=.env.local scripts/tests/export-data.mjs --live
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
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

const { fetchSupabaseRowsForIds } = loadTypeScript('src/lib/supabase/fetch-all.ts');
const ids = Array.from({ length: 4118 }, (_, index) => index + 1);
const calls = [];
const rows = await fetchSupabaseRowsForIds([...ids, ...ids.slice(0, 10)], (batch) => ({
  async range(from, to) {
    assert.ok(batch.length <= 100, 'IN filters must remain bounded');
    calls.push({ batch, from });
    // More than 1,000 relations in a batch must also paginate.
    const related = batch.flatMap(id => Array.from({ length: 11 }, (_, relation) => ({ id, relation })));
    return { data: related.slice(from, to + 1), error: null };
  },
}));
assert.equal(rows.length, 4118 * 11);
assert.equal(new Set(rows.map(row => `${row.id}:${row.relation}`)).size, rows.length);
assert.ok(calls.some(call => call.from === 1000));
assert.deepEqual(await fetchSupabaseRowsForIds([], () => { throw new Error('Empty query'); }), []);
const failure = new Error('Failed second page');
await assert.rejects(fetchSupabaseRowsForIds([1], () => ({
  async range(from) {
    return from ? { data: null, error: failure } : { data: Array(1000).fill({ id: 1 }), error: null };
  },
})), error => error === failure);
await assert.rejects(fetchSupabaseRowsForIds(ids, batch => ({
  async range() { return { data: [], error: batch[0] === 101 ? failure : null }; },
})), error => error === failure);
console.log('PASS: 4,118 IDs, deduplication, multi-page relations, empty lists and failed pages/batches.');

// Exercise the export loaders with lists larger than PostgREST's default cap.
const dataModule = loadTypeScript('src/lib/exports/data.ts');
const fixtureContacts = ids.map(id => ({ id, first_name: 'Same', last_name: 'Name',
  status: 'active', priority: 'standard', deleted_at: null }));
const fixtureProfileId = id => `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`;
const fixtures = {
  events: [{ id: 492, title: 'Regression', parts: [] }],
  contacts: fixtureContacts,
  event_invitations: ids.slice(0, 1205).map(id => ({ id, event_id: 492, contact_id: id,
    response_recorded_by_profile_id: fixtureProfileId(id), contacts: fixtureContacts[id - 1],
    part_responses: [], invitation_status: 'invited', response_status: 'no_response', attendance_status: 'unknown' })),
  invitation_proposals: ids.slice(1205, 2310).map(id => ({ id, event_id: 492, contact_id: id,
    status: 'pending', contacts: fixtureContacts[id - 1], internal_references: { id: 1, full_name: 'Reference' } })),
  profiles: ids.slice(0, 1205).map(id => ({ id: fixtureProfileId(id), full_name: `Profile ${id}` })),
  groups: ids.slice(0, 1105).map(id => ({ id, name: `Group ${id}` })),
  internal_references: ids.slice(0, 1105).map(id => ({ id, full_name: `Reference ${id}`, deleted_at: null })),
  contact_groups: ids.map(id => ({ contact_id: id, group_id: 3 })),
  contact_references: ids.map(id => ({ contact_id: id, reference_id: 1 })),
  contacts_missing_required_data: ids.map(id => ({ id, missing_fields: ['email'] })),
};
const fixtureClient = createClient('https://fixture.invalid', 'fixture-key', {
  auth: { persistSession: false }, global: { fetch: async (input, init) => {
    const url = new URL(input);
    assert.ok(url.toString().length < 8192, 'Proxy rejects long URLs');
    const table = url.pathname.split('/').pop();
    let result = fixtures[table];
    assert.ok(result, `Unexpected table: ${table}`);
    for (const [key, value] of url.searchParams) {
      if (value.startsWith('eq.')) result = result.filter(row => String(row[key]) === value.slice(3));
      if (value.startsWith('is.')) result = result.filter(row => row[key] === null);
      if (value.startsWith('in.(')) {
        const selected = new Set(value.slice(4, -1).split(','));
        result = result.filter(row => selected.has(String(row[key])));
      }
    }
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Math.min(1000, Number(url.searchParams.get('limit') ?? 1000));
    if (url.searchParams.has('limit')) assert.ok(url.searchParams.has('order'), 'Paginated reads require stable order');
    result = result.slice(offset, offset + limit);
    const accept = new Headers(init?.headers).get('accept') ?? '';
    if (accept.includes('vnd.pgrst.object')) result = result[0] ?? null;
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } },
});
const fixtureEvent = await dataModule.loadEventForExport(fixtureClient, 492);
assert.equal(fixtureEvent.rows.filter(row => row.rowType === 'invitation').length, 1205);
assert.equal(fixtureEvent.rows.filter(row => row.rowType === 'proposal').length, 1105);
assert.equal(fixtureEvent.options.groups.length, 1105);
assert.equal(fixtureEvent.options.references.length, 1105);
assert.ok(fixtureEvent.rows.every(row => row.contact.group_ids[0] === 3 && row.contact.reference_ids[0] === 1));
assert.equal(fixtureEvent.rows.find(row => row.contactId === 1205).responseRecordedByName, 'Profile 1205');
const fixtureAvailable = await dataModule.loadNotInvitedContactsForEvent(fixtureClient, 492);
assert.deepEqual(fixtureAvailable.contacts.map(contact => contact.id), ids.slice(2310));
assert.ok(fixtureAvailable.contacts.every(contact => contact.group_ids[0] === 3 && contact.missing_fields[0] === 'email'));
console.log('PASS: large event and not-invited loaders preserve all invitations, proposals, profiles and relations.');

if (process.argv.includes('--live')) {
  const requestStats = { count: 0, maxUrlLength: 0 };
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false }, global: { fetch: async (input, init) => {
      requestStats.count++;
      requestStats.maxUrlLength = Math.max(requestStats.maxUrlLength, String(input).length);
      assert.ok(['GET', 'POST'].includes(init?.method ?? 'GET'));
      if (init?.method === 'POST') assert.ok(String(input).includes('/rpc/search_contacts_page'));
      const response = await fetch(input, init);
      assert.ok(response.ok, `Database request failed: ${response.status}`);
      return response;
    } } },
  );
  const data = loadTypeScript('src/lib/exports/data.ts');
  const tables = loadTypeScript('src/lib/exports/tables.ts');
  const render = loadTypeScript('src/lib/exports/renderers.ts');
  let files = 0;
  async function verifyTable(table, simpleLayout) {
    const pdf = await render.renderPdf(table);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    const xlsx = await render.renderExcel(table, { simpleLayout });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx);
    assert.equal(workbook.worksheets[0].rowCount, table.rows.length + (simpleLayout ? 1 : 3));
    files += 2;
  }
  const event = await data.loadEventForExport(supabase, 492);
  assert.ok(event);
  const available = await data.loadNotInvitedContactsForEvent(supabase, 492);
  const allContacts = await data.loadContactsForExport(supabase, new URLSearchParams('status=active'));
  const expected = allContacts.contacts.filter(contact => !event.invitedContactIds.has(Number(contact.id)));
  const sortedIds = contacts => contacts.map(contact => Number(contact.id)).sort((a, b) => a - b);
  assert.deepEqual(sortedIds(available.contacts), sortedIds(expected));
  for (const groups of [[], [3]]) {
    const matches = contact => groups.length === 0 || contact.group_ids.includes(3);
    const contacts = available.contacts.filter(matches);
    assert.deepEqual(sortedIds(contacts), sortedIds(expected.filter(matches)));
    for (const type of ['invitations', 'invitations_by_group', 'responses', 'participants', 'followup', 'proposals']) {
      await verifyTable(tables.buildEventTable(String(event.event.title), event.rows.filter(row => matches(row.contact)), type, event.options), true);
    }
    await verifyTable(tables.buildNotInvitedTable(String(event.event.title), contacts, available.options), true);
    const labels = await render.renderLabelsPdf(tables.eventLabels(event.rows.filter(row => matches(row.contact))), 'Etichette');
    assert.equal(labels.subarray(0, 5).toString(), '%PDF-');
    files++;
    const contactResult = groups.length
      ? await data.loadContactsForExport(supabase, new URLSearchParams('groups=3&status=active')) : allContacts;
    for (const type of ['list', 'missing']) {
      await verifyTable(tables.buildContactsTable(contactResult.contacts, type, event.options, contactResult.filters), false);
    }
    const contactLabels = await render.renderLabelsPdf(tables.contactLabels(contactResult.contacts), 'Etichette contatti');
    assert.equal(contactLabels.subarray(0, 5).toString(), '%PDF-');
    files++;
    console.log(`PASS live: ${groups.length ? 'Ambasciate' : 'all groups'}, not invited=${contacts.length}`);
  }
  console.log(JSON.stringify({ files, ...requestStats }));
}
