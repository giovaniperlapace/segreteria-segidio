import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(path,mocks={}){const js=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const m={exports:{}};new Function('require','module','exports',js)(id=>id in mocks?mocks[id]:require(id),m,m.exports);return m.exports;}
let tables, deliveries, results, failLog, failInvitation, denied;
const supabase={from(table){let filters=[],patch=null,single=false,limit=Infinity,start=0,end=Infinity,insert=null;
  const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},neq(k,v){filters.push(r=>r[k]!==v);return q;},is(k,v){filters.push(r=>(r[k]??null)===v);return q;},in(k,v){filters.push(r=>v.includes(r[k]));return q;},order(){return q;},limit(v){limit=v;return q;},range(a,b){start=a;end=b;return q;},maybeSingle(){single=true;return q;},single(){single=true;return q;},update(p){patch=p;return q;},insert(p){insert=Array.isArray(p)?p:[p];return q;},then(resolve){
    let data=tables[table].filter(r=>filters.every(f=>f(r))).slice(start,Math.min(end+1,start+limit));
    if((failLog&&table==='email_logs'&&patch?.status==='sent')||(failInvitation&&table==='event_invitations'&&patch?.invitation_status==='invited'))return Promise.resolve({data:null,error:Error('db unavailable')}).then(resolve);
    if(insert){data=insert.map((r,i)=>({...r,id:tables[table].length+i+1}));tables[table].push(...data);}
    if(patch)data.forEach(r=>Object.assign(r,patch));
    return Promise.resolve({data:single?(data[0]?structuredClone(data[0]):null):structuredClone(data),error:null}).then(resolve);
  }};return q;
}};
const links=load('../../src/lib/email/public-response-links.ts');
const actions=load('../../src/app/dashboard/events/email-actions.ts',{
 '@/lib/email/personalized-badge': load('../../src/lib/email/personalized-badge.ts', {'./badge-attachment': load('../../src/lib/email/badge-attachment.ts')}),
 '@/lib/email/selected-invitations':load('../../src/lib/email/selected-invitations.ts'),
 '@/lib/email/invitation-recipients': load('../../src/lib/email/invitation-recipients.ts'),
  'next/server':{after(){}}, '@/lib/email/sent-archive':{processSentArchives:async()=>({})}, 'next/cache':{revalidatePath(){}},'@/lib/invitations/event-parts':{emailPartFilterIds:()=>[],matchesInvitedParts:()=>true},
 '@/lib/auth/profile':{requireManager:async()=>{if(denied)throw Error('Forbidden');return{id:'manager'};}},
 '@/lib/email/config':{getEmailConfig:()=>({})},
 '@/lib/email/postmark':{sendBroadcastBatch:async inputs=>{deliveries.push(...inputs);return inputs.map((_,i)=>results?.[i]??{messageId:'id-'+i});}},
 '@/lib/email/public-response-links':links,'@/lib/email/templates':{renderEmailTemplate:s=>s,plainTextToHtml:s=>'<p>'+s+'</p>'},
 '@/lib/supabase/service':{createSupabaseServiceClient:()=>supabase},
 '@/lib/supabase/fetch-all':load('../../src/lib/supabase/fetch-all.ts'),
});
function reset(count=2){deliveries=[];results=null;failLog=false;failInvitation=false;denied=false;tables={
 email_batches:[{id:1,event_id:2,status:'queued',sent_count:0,failed_count:0,include_public_response_link:false,last_error:null}],
 email_logs:Array.from({length:count},(_,i)=>({id:i+1,batch_id:1,event_id:2,invitation_id:i+1,contact_id:i+1,status:'queued',to_email:`person${i}@example.org`,subject:'Invito',rendered_text:'Test',rendered_html:null,attempt_count:0,provider_message_id:null,response_url:null})),
 email_batch_attachments:[],event_invitations:Array.from({length:count},(_,i)=>({id:i+1,event_id:2,invitation_status:'selected',part_responses:[],response_status:'no_response'})),
};}
function send(retry=false){const form=new FormData();form.set('batchId','1');form.set('eventId','2');form.set('omitPublicResponseLink','on');if(retry)form.set('includeFailed','on');return actions.sendEmailBatchAction({},form);}
reset();assert.equal((await send()).status,'success');assert.equal(deliveries.length,2);assert.equal(tables.email_batches[0].sent_count,2);assert.ok(tables.event_invitations.every(i=>i.invitation_status==='invited'));await send(true);assert.equal(deliveries.length,2);
reset();await Promise.all([send(),send()]);assert.equal(deliveries.length,2,'concurrent callers must not duplicate delivery');
reset();results=[{messageId:'ok'},{errorCode:'postmark_406'}];await send();assert.equal(tables.email_logs[1].status,'skipped');await send(true);assert.equal(deliveries.length,2,'suppressed address never retried');
reset();results=[{messageId:'ok'},{errorCode:'postmark_delivery_unknown',disposition:'unknown'}];assert.equal((await send()).status,'error');assert.equal(tables.email_logs[1].status,'sending');assert.equal(tables.email_batches[0].status,'sending');await send(true);assert.equal(deliveries.length,2,'unknown outcome never retried');
reset();results=[{errorCode:'postmark_429',disposition:'retry',retryAfterSeconds:120},{errorCode:'postmark_batch_deferred',disposition:'retry'}];await send();assert.match(tables.email_batches[0].last_error,/Riprovare dopo/);await send(true);assert.equal(deliveries.length,2,'retry-after is enforced on server');
reset();failLog=true;await send();assert.ok(tables.email_logs.every(l=>l.status==='sending'));await send(true);assert.equal(deliveries.length,2,'accepted messages with failed log writes never retried');
reset();failInvitation=true;await send();assert.ok(tables.email_logs.every(l=>l.status==='sent'));await send(true);assert.equal(deliveries.length,2,'invitation failure cannot make accepted message retryable');
reset(1002);tables.email_logs.forEach((r,i)=>{r.status=i<1001?'sent':'queued';r.provider_message_id=i<1001?'legacy':null;});await send();assert.equal(tables.email_batches[0].sent_count,1002,'counters include pages beyond 1000');
reset();denied=true;await assert.rejects(send(),/Forbidden/);assert.equal(deliveries.length,0);
reset(0);tables.events=[{id:2,title:'Evento',parts:[]}];tables.email_templates=[{id:3,active:true,deleted_at:null,subject:'Invito',body_text:'Gentile'}];tables.event_invitations=[{id:7,event_id:2,contact_id:4,invitation_status:'selected',part_responses:[],contacts:{email:'one@example.org; TWO@example.org',email_2:'two@example.org'}}];
const form=new FormData();form.set('eventId','2');form.set('templateId','3');form.set('targetKind','selected');assert.equal((await actions.createEmailBatchAction({},form)).status,'success');assert.equal(tables.email_logs.length,2);assert.equal(tables.email_logs[0].to_email,'one@example.org');assert.equal(tables.email_logs[1].to_email,'TWO@example.org');
console.log('Batch actions: concurrent claims, per-address logs, address deduplication, suppression, cooldown, ambiguous outcomes, persistence failures, paginated counters and authorization passed. No real data or email changed.');

// Follow-up communication: confirmed and declined rows stay selectable; unselected rows never leak in.
for (const response of ['attending', 'declined', 'maybe', 'no_response']) {
  tables.email_logs = [];
  tables.event_invitations = [
    {id:7,event_id:2,contact_id:4,invitation_status:'invited',response_status:response,part_responses:[{id:'opening',response}],contacts:{email:'selected@example.org'}},
    {id:8,event_id:2,contact_id:5,invitation_status:'invited',response_status:'attending',part_responses:[],contacts:{email:'other@example.org'}},
  ];
  form.set('targetKind','selected_rows'); form.set('selectedInvitationIds','7');
  assert.equal((await actions.createEmailBatchAction({},form)).status,'success');
  assert.deepEqual(tables.email_logs.map(row=>row.to_email),['selected@example.org']);
}
for (const status of ['draft','proposed','excluded']) {
  tables.email_logs=[]; tables.event_invitations[0].invitation_status=status;
  assert.equal((await actions.createEmailBatchAction({},form)).status,'error');
  assert.equal(tables.email_logs.length,0);
}
assert.equal(deliveries.length,0,'preparing follow-up batches must not send emails');
console.log('Selected-row follow-ups: all responses, composite events, selection isolation and excluded states passed.');
// Recipient routing uses the selected list part, with contact fallback only when no delegate email is supplied.
tables.events[0].parts=[{id:'opening',title:'Opening'},{id:'closing',title:'Closing'}];
const routingCases=[
  {parts:[{id:'opening',response:'delegated',email:'opening@example.org'},{id:'closing',response:'delegated',email:'closing@example.org'}],scope:'opening',expected:['opening@example.org']},
  {parts:[{id:'opening',response:'delegated',email:''},{id:'closing',response:'delegated',email:'closing@example.org'}],scope:'opening',expected:['contact@example.org','second@example.org']},
  {parts:[{id:'opening',response:'attending'},{id:'closing',response:'delegated',email:'closing@example.org'}],scope:'opening',expected:['contact@example.org','second@example.org']},
  {parts:[],delegate:'delegate@example.org',scope:'',expected:['delegate@example.org']},
  {parts:[],delegate:null,scope:'',expected:['contact@example.org','second@example.org']},
  {parts:[{id:'opening',response:'delegated',email:'same@example.org'},{id:'closing',response:'delegated',email:'SAME@example.org'}],scope:'',expected:['same@example.org']},
];
for(const test of routingCases){
 tables.email_logs=[];
 tables.event_invitations=[{id:7,event_id:2,contact_id:4,invitation_status:'invited',response_status:'attending',part_responses:test.parts,delegate_email:test.delegate,contacts:{email:'contact@example.org',email_2:'second@example.org'}}];
 form.set('selectedListPartId',test.scope);
 assert.equal((await actions.createEmailBatchAction({},form)).status,'success');
 assert.deepEqual(tables.email_logs.map(row=>row.to_email),test.expected);
}
assert.equal(deliveries.length,0);
console.log('Delegate routing: part isolation, contact fallback, simple events and deduplication passed.');

// Real badge renderer with isolated database/provider: validation, delegate identity and retry snapshot.
reset(0);
tables.email_batches=[];
tables.events=[{id:2,title:'Evento',parts:[]}];
tables.email_templates=[{id:3,active:true,deleted_at:null,subject:'Invito',body_text:'Gentile'}];
tables.event_invitations=[
 {id:7,event_id:2,contact_id:4,invitation_status:'invited',part_responses:[],delegate_email:'delegate@example.org',delegate_first_name:'Maria',delegate_last_name:'Delegata',contacts:{first_name:'Mario',last_name:'Invitato',email:'contact@example.org'}},
 {id:8,event_id:2,contact_id:5,invitation_status:'invited',part_responses:[],contacts:{first_name:'José',last_name:'Rossi',email:'second@example.org'}},
];
const badgeForm=new FormData();badgeForm.set('eventId','2');badgeForm.set('templateId','3');badgeForm.set('targetKind','selected_rows');badgeForm.append('selectedInvitationIds','7');badgeForm.append('selectedInvitationIds','8');
const source=await require('sharp')({create:{width:800,height:1205,channels:3,background:'white'}}).jpeg().toBuffer();
badgeForm.set('badgeImage',new File([source],'badge.jpg',{type:'image/jpeg'}));
badgeForm.set('badgeLayout',JSON.stringify({firstX:50,firstY:87,lastX:50,lastY:93,fontSize:5}));
process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test-secret';
const before=structuredClone(tables);
const preview=await actions.previewPersonalizedBadgeAction(badgeForm,true);
assert.equal(preview.status,'success');assert.match(preview.label,/Maria Delegata/);assert.deepEqual(tables,before,'preview must not write');
assert.equal((await actions.createEmailBatchAction({},badgeForm)).status,'error','validation required');assert.deepEqual(tables,before);
badgeForm.set('badgeProof',preview.proof);
tables.event_invitations[1].contacts.first_name='Changed';
assert.equal((await actions.createEmailBatchAction({},badgeForm)).status,'error','changed recipient invalidates proof');
tables.event_invitations[1].contacts.first_name='José';
assert.equal((await actions.createEmailBatchAction({},badgeForm)).status,'success');
assert.equal('data:image/jpeg;base64,'+tables.email_logs[0].personalized_badge.content_base64,preview.image,'exact first-recipient preview');
assert.notEqual(tables.email_logs[0].personalized_badge.content_base64,tables.email_logs[1].personalized_badge.content_base64);
const snapshots=tables.email_logs.map(l=>l.personalized_badge.content_base64);
tables.email_logs.forEach(l=>{l.attempt_count=0;l.provider_message_id=null});
// Editing the current contact after preparation must not change the attached badge.
tables.event_invitations[0].delegate_first_name='Different';
results=[{errorCode:'temporary_failure'}, {messageId:'ok'}];await send();
assert.equal(deliveries[0].attachments[0].content.toString('base64'),snapshots[0]);
results=null;await send(true);
assert.equal(deliveries[2].attachments[0].content.toString('base64'),snapshots[0],'retry reuses snapshot');
denied=true;await assert.rejects(actions.previewPersonalizedBadgeAction(badgeForm,true),/Forbidden/);
console.log('Personalized batch: read-only manager preview, signed validation, delegate identity, distinct recipient attachments, immutable retry and no cross-recipient leakage passed.');
