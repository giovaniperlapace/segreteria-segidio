import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const m = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(id => id in mocks ? mocks[id] : id === './badge-attachment' ? load('src/lib/email/badge-attachment.ts') : require(id), m, m.exports);
  return m.exports;
}
const { readBadge, renderBadge, DEFAULT_BADGE_LAYOUT: layout, badgeProof, verifyBadgeProof, badgeMailAttachment } = load('src/lib/email/personalized-badge.ts');
const source = process.argv[2] ? readFileSync(process.argv[2]) : await sharp({ create: { width: 800, height: 1205, channels: 3, background: 'white' } }).jpeg().toBuffer();
const form = new FormData(); form.set('badgeImage', new File([source], 'badge.jpg', { type: 'image/jpeg' })); form.set('badgeLayout', JSON.stringify(layout));
const badge = await readBadge(form);
const first = await renderBadge(badge.image, layout, 'Maria Chiara', 'D’Angelo');
const second = await renderBadge(badge.image, layout, 'José António', 'De Albuquerque e Vasconcelos');
assert.notEqual(first.content_base64, second.content_base64);
assert.equal(first.file_size_bytes, Buffer.from(first.content_base64, 'base64').length);
assert.equal((await sharp(Buffer.from(first.content_base64, 'base64')).metadata()).format, 'jpeg');
assert.equal((await renderBadge(badge.image, layout, 'Maria Chiara', 'D’Angelo')).content_base64, first.content_base64, 'identical preview and delivery');
await renderBadge(badge.image, layout, '<Mario & Maria>', 'Un cognome estremamente lungo '.repeat(6));
await assert.rejects(renderBadge(badge.image, layout, '', 'Rossi'), /nome o cognome mancante/);
process.env.SUPABASE_SERVICE_ROLE_KEY = 'isolated-test-secret';
const audience = [{ firstName: 'Mario', lastName: 'Rossi', email: 'm@example.org' }];
const proof = badgeProof(badge.image, layout, audience);
assert(verifyBadgeProof(proof, proof));
assert(!verifyBadgeProof('no', proof));
assert(!verifyBadgeProof(proof, badgeProof(badge.image, { ...layout, firstX: 40 }, audience)));
assert(!verifyBadgeProof(proof, badgeProof(badge.image, layout, [])));
assert.deepEqual(badgeMailAttachment(first)[0].content, Buffer.from(first.content_base64, 'base64'));
form.set('badgeLayout', JSON.stringify({ ...layout, firstX: -1 })); await assert.rejects(readBadge(form), /posizione/);
form.set('badgeLayout', JSON.stringify(layout)); form.set('badgeImage', new File(['bad'], 'bad.jpg')); await assert.rejects(readBadge(form));
if (process.argv[3]) writeFileSync(process.argv[3], Buffer.from(first.content_base64, 'base64'));
console.log('Badge: JPG validation, rendering, accents, long names, missing names, exact preview, recipient/layout proof and immutable attachment passed.');

const saved = { file_name: 'badge-personalizzato.jpg', content_type: 'image/jpeg', file_size_bytes: 15, content_base64: Buffer.from('recipient badge').toString('base64') };
const archive = load('src/lib/email/archive-original.ts', {
 '../supabase/service': { createSupabaseServiceClient: () => ({ from(table) { const q = { select(){return q}, eq(){return q}, single(){return q}, then(resolve){ return Promise.resolve({data:table==='email_logs'?{batch_id:1,to_email:'recipient@example.org',subject:'Invito',personalized_badge:saved}:[],error:null}).then(resolve); } }; return q; } }) },
 './delivery-evidence': { syncDeliveryEvidence: async () => ({ Subject:'Invito', TextBody:'Body', From:'sender@example.org', Attachments:['badge-personalizzato.jpg'] }) },
});
const recovered = await archive.restoreArchiveOriginal(1,'provider-id','[MESSAGE TRUNCATED]',{messageId:'<original@example.org>',originalDate:'2026-10-24T12:00:00Z'});
assert(recovered.includes(saved.content_base64));
assert(recovered.includes('badge-personalizzato.jpg'));
assert(archive.completeOriginal(recovered));
console.log('Badge archive: truncated provider MIME rebuilt with exact recipient-specific snapshot bytes.');

const { badgePreviewForm } = load('src/lib/email/badge-preview-form.ts');
const previewSource = new FormData();
previewSource.set('badgeImage', new File([source], 'badge.jpg', { type: 'image/jpeg' }));
previewSource.set('attachments', new File([new Uint8Array(6 * 1024 * 1024)], 'large.pdf'));
previewSource.set('$ACTION_REF_1', 'internal-react-metadata');
previewSource.set('eventId', '495');
previewSource.append('selectedInvitationIds', '1'); previewSource.append('selectedInvitationIds', '2');
const placeholderData = badgePreviewForm(previewSource, false, layout);
assert.deepEqual([...placeholderData.keys()], ['badgeImage', 'badgeEnabled', 'badgeLayout']);
const recipientData = badgePreviewForm(previewSource, true, layout);
assert.deepEqual(recipientData.getAll('selectedInvitationIds'), ['1', '2']);
assert.equal(recipientData.get('eventId'), '495');
assert.equal(recipientData.has('attachments'), false);
assert.equal(recipientData.has('$ACTION_REF_1'), false);
previewSource.set('badgeImage', new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'large.jpg'));
assert.throws(() => badgePreviewForm(previewSource, false, layout), /supera 4 MB/);
console.log('Badge preview: oversized uploads blocked before network; unrelated files and action metadata excluded.');
