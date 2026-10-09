import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(path,mocks={}){const js=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('require','module','exports',js)(id=>id in mocks?mocks[id]:require(id),m,m.exports);return m.exports;}
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
 'next/cache':{revalidatePath(){}},'@/lib/invitations/event-parts':{emailPartFilterIds:()=>[],matchesInvitedParts:()=>true},
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
