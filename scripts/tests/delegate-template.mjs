import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
function load(path) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = { exports: {} };
  new Function('exports', 'module', code)(m.exports, m);
  return m.exports;
}
const { invitationRecipientContact, invitationRecipients } = load('../../src/lib/email/invitation-recipients.ts');
const { renderEmailTemplate } = load('../../src/lib/email/templates.ts');
const contact = { first_name:'Giuseppe', last_name:'Notarstefano', honorific_title:'Dott.', honorific_title_invitation:'Presidente', institutional_role:'Presidente', institutional_role_invitation:'Presidente nazionale', institution:'Istituzione originale', legacy_salutation:'Egregio Presidente Giuseppe Notarstefano', email:'original@example.org', email_2:null };
const event = {title:'Evento',starts_at:'2026-10-25T09:00:00Z',location:'Assisi'};
const row = { part_responses:[
  {id:'opening',response:'delegated',firstName:'Paola',lastName:'Fratini',email:'paola@example.org',role:'Vicepresidente'},
  {id:'closing',response:'delegated',firstName:'Paolo',lastName:'Seghedoni',email:'paolo@example.org'},
] };
const template = '{{saluto}}|{{nome}}|{{cognome}}|{{nome_completo}}|{{carica}}|{{titolo_invito}}|{{istituzione}}|{{email}}';
function render(row, ids, email) { return renderEmailTemplate(template,{event,contact:invitationRecipientContact(row,contact,ids,email)}); }
assert.equal(render(row,['opening'],'paola@example.org'),'Gentile Paola Fratini|Paola|Fratini|Paola Fratini|Vicepresidente|||paola@example.org');
assert.equal(render(row,[],'paolo@example.org'),'Gentile Paolo Seghedoni|Paolo|Seghedoni|Paolo Seghedoni||||paolo@example.org');
assert.equal(render(row,['opening'],'original@example.org'),renderEmailTemplate(template,{event,contact}));
const sameEmail = {part_responses:row.part_responses.map(p=>({...p,email:'shared@example.org'}))};
assert.match(render(sameEmail,['closing'],'SHARED@example.org'),/^Gentile Paolo Seghedoni/);
assert.match(render({...row,part_responses:[{...row.part_responses[0],email:contact.email}]},['opening'],contact.email),/^Gentile Paola Fratini/);
const fallback={part_responses:[{...row.part_responses[0],email:''}]};
assert.deepEqual(invitationRecipients(fallback,contact,['opening']),[contact.email]);
assert.equal(render(fallback,['opening'],contact.email),renderEmailTemplate(template,{event,contact}));
assert.match(render({part_responses:[],delegate_email:'paola@example.org',delegate_first_name:'Paola',delegate_last_name:'Fratini',delegate_role:'Vicepresidente'},[],'paola@example.org'),/^Gentile Paola Fratini/);
assert.doesNotMatch(render({part_responses:[{id:'opening',response:'delegated',email:'unknown@example.org'}]},['opening'],'unknown@example.org'),/Giuseppe|Notarstefano|Presidente|Istituzione originale/);
console.log('Delegate template: names, salutation, role, part isolation, per-address personalization and fallback passed.');
