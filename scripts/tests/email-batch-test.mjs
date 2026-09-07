import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(path, mocks = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((id) => id in mocks ? mocks[id] : require(id), module, module.exports);
  return module.exports;
}
const links = load('../../src/lib/email/public-response-links.ts');
let sent, denied = false, tables, queries;
const supabase = { from(table) {
  const query = { table, filters: [] };
  queries.push(query);
  const builder = {
    select() { return this; },
    eq(key, value) { query.filters.push([key, value]); return this; },
    order(key) { query.order = key; return this; },
    limit(value) { query.limit = value; return this; },
    maybeSingle() { return this; }, single() { return this; },
    then(resolve) { return Promise.resolve({ data: tables[table], error: null }).then(resolve); },
  };
  // Deliberately no insert/update/delete: tests fail if a preview writes data.
  return builder;
} };
const { sendEmailBatchTestAction } = load('../../src/app/dashboard/events/email-actions.ts', {
  'next/cache': {}, '@/lib/invitations/event-parts': {},
  '@/lib/auth/profile': { requireManager: async () => { if (denied) throw Error('Forbidden'); } },
  '@/lib/email/gmail': { sendSmtpEmail: async (input) => { sent = input; return {}; } },
  '@/lib/email/public-response-links': links, '@/lib/email/templates': {},
  '@/lib/supabase/service': { createSupabaseServiceClient: () => supabase },
});
function reset() {
  sent = null; queries = [];
  tables = {
    email_batches: { id: 2, status: 'queued', sent_count: 0, failed_count: 0, include_public_response_link: true },
    email_logs: { invitation_id: 3, subject: 'Invito Mario', rendered_text: 'Gentile Mario', rendered_html: '<p>Gentile Mario</p>', response_url: null, to_email: 'real@example.org, second@example.org' },
    event_invitations: { part_responses: [], response_status: 'no_response', delegate_email: null },
    email_batch_attachments: [{ email_attachments: { file_name: 'invito.pdf', content_type: 'application/pdf', content_base64: Buffer.from('PDF').toString('base64') } }],
  };
}
async function run(omit = false) {
  const form = new FormData(); form.set('eventId', '1'); form.set('batchId', '2');
  form.set('to', 'attacker@example.org');
  if (omit) form.set('omitPublicResponseLink', 'on');
  return sendEmailBatchTestAction({}, form);
}
reset(); assert.equal((await run()).status, 'success');
assert.equal(sent.to, 'segreteriagenerale@santegidio.org');
assert.equal(sent.subject, '[PROVA] Invito Mario');
assert.match(sent.text, /Gentile Mario/); assert.match(sent.html, /prova-email/);
assert.equal(sent.attachments[0].content.toString(), 'PDF');
assert.equal(queries.find(q => q.table === 'email_logs').order, 'id');
assert.equal(queries.find(q => q.table === 'email_logs').limit, 1);
reset(); await run(true); assert.doesNotMatch(sent.html, /Comunica la risposta/);
reset(); tables.event_invitations.response_status = 'attending'; await run(); assert.doesNotMatch(sent.html, /Comunica la risposta/);
reset(); tables.event_invitations.part_responses = [{ id: 'a', response: 'attending' }]; await run(); assert.match(sent.html, /Comunica la risposta/);
reset();
const old = links.appendPublicResponseLink({ text: 'Gentile Mario', html: '<p>Gentile Mario</p>', responseUrl: 'https://example.org/risposta/real-secret' });
Object.assign(tables.email_logs, { rendered_text: old.text, rendered_html: old.html, response_url: 'https://example.org/risposta/real-secret' });
await run(); assert.doesNotMatch(sent.html + sent.text, /real-secret/);
reset(); tables.email_batches = null; assert.equal((await run()).status, 'error'); assert.equal(sent, null);
reset(); tables.email_logs = null; assert.equal((await run()).status, 'error'); assert.equal(sent, null);
reset(); denied = true; await assert.rejects(run(), /Forbidden/); assert.equal(sent, null);
console.log('Email batch test: isolated recipient, attachments, link options, token isolation, read-only access and authorization passed. No real emails sent.');
