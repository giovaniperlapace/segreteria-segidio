import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import ts from 'typescript';
const filename = path.resolve('src/lib/exports/candidates.ts');
const mod = new Module(filename);
mod.filename = filename;
mod.paths = Module._nodeModulePaths(path.dirname(filename));
mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { candidateSearchArgs, loadAllCandidates } = mod.exports;
const query = { groupIds: ['3,4', '3'], match: 'or', q: ' Ambasciata ', referenceIds: '7', pastEventIds: '488', pastResponse: 'declined', pastAttendance: 'absent', page: '2' };
const args = candidateSearchArgs(492, query);
assert.deepEqual(args.p_group_ids, [3, 4]);
assert.equal(args.p_match, 'or');
assert.equal(args.p_past_response, 'declined');
assert.equal(args.p_past_attendance, 'absent');
const calls = [];
const client = {
  async rpc(name, params) {
    calls.push(params);
    assert.equal(name, 'event_candidate_contacts_page');
    assert.deepEqual(params.p_group_ids, [3, 4]);
    return { data: Array.from({ length: Math.min(100, 205 - params.p_offset) }, (_, i) => ({ candidate: { id: params.p_offset + i + 1 }, total_count: 205 })), error: null };
  },
  from() { return { select() { return { async in(key, ids) { assert.ok(ids.length <= 100); return { data: ids.map(id => ({ id, country: 'Italia', first_name: 'Maria Luisa', last_name: 'De Rossi' })), error: null }; } }; } }; },
};
const rows = await loadAllCandidates(client, 492, query);
assert.equal(rows.length, 205);
assert.deepEqual(calls.map(call => call.p_offset), [0, 100, 200]);
assert.equal(rows[204].country, 'Italia');
assert.equal(rows[204].firstName, 'Maria Luisa');
assert.equal(rows[204].lastName, 'De Rossi');
await assert.rejects(() => loadAllCandidates({ ...client, rpc: async () => ({ error: new Error('database unavailable') }) }, 492, query), /database unavailable/);
const empty = await loadAllCandidates({ ...client, rpc: async () => ({ data: [], error: null }) }, 492, query);
assert.deepEqual(empty, []);
console.log('PASS: candidate filters, full pagination, country batches, empty results and fail-closed errors');
