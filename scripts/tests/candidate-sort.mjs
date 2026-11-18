import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../../src/lib/exports/candidate-sort.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = { exports: {}, Intl };
vm.runInNewContext(compiled, context);
const { candidateSortKey, sortCandidates, candidateSortColumns } = context.exports;
const make = (id, lastName, extra = {}) => ({
  id, name: lastName, lastName, firstName: "Anna", country: "Italia",
  groups: ["Gruppo"], references: ["Referente"], missingFields: [],
  proposalSummary: "Referente: approved", ...extra,
});
assert.equal(candidateSortKey("invalid"), null);
const rows = [make(3, "Zulu"), make(2, "Alfa"), make(1, "Alfa")];
assert.equal(sortCandidates(rows, "contact", false).map(r => r.id).join(), "1,2,3");
assert.equal(sortCandidates(rows, "contact", true).map(r => r.id).join(), "3,1,2");
assert.equal(rows.map(r => r.id).join(), "3,2,1", "Input must remain unchanged");
for (const { key } of candidateSortColumns) {
  const a = make(1, "Alfa", { country: "Albania", groups: ["Alfa"], references: ["Alfa"], missingFields: [], proposalSummary: "Alfa" });
  const z = make(2, "Zulu", { country: "Zambia", groups: ["Zulu"], references: ["Zulu"], missingFields: ["email"], proposalSummary: "Zulu" });
  assert.equal(sortCandidates([z, a], key, false)[0].id, 1, key);
  assert.equal(sortCandidates([z, a], key, true)[0].id, 2, key);
}
for (const descending of [false, true]) {
  assert.equal(sortCandidates([make(1, "A", { country: null }), make(2, "B")], "country", descending)[1].id, 1);
}
const many = Array.from({ length: 182 }, (_, i) => make(i + 1, `Persona ${182 - i}`));
const sorted = sortCandidates(many, "contact", false);
assert.equal(sorted.slice(0, 50)[0].lastName, "Persona 1");
assert.equal(sorted.slice(150, 200).length, 32);
assert.equal(new Set(sorted.map(r => r.id)).size, 182);
console.log("Candidate sorting: all columns, directions, missing values, stable ties and global pagination passed.");
