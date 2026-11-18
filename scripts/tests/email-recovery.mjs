import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(file,mocks={}){
 const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};new Function('require','module','exports',code)(id=>id in mocks?mocks[id]:require(id),mod,mod.exports);return mod.exports;
}
let tables, calls, denied;
const db={from(table){
 let filters=[],limit=Infinity,single=false;
 const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},
 not(k,op,v){filters.push(r=>r[k]!=v);return q},order(){return q},range(a,b){limit=b-a+1;return q},
 limit(n){limit=n;return q},single(){single=true;return q},maybeSingle(){single=true;return q},
 then(resolve){const rows=tables[table].filter(r=>filters.every(f=>f(r))).slice(0,limit);return Promise.resolve({data:single?rows[0]:rows,error:null}).then(resolve)}};return q;
},async rpc(name,args){calls.push({name,args});return {data:{batch_id:80,count:args.p_messages.length},error:null}}};
const action=load('../../src/app/dashboard/events/email-recovery-actions.ts',{
 'next/cache':{revalidatePath(){}},
 '@/lib/auth/profile':{requireManager:async()=>{if(denied)throw Error('Forbidden');return{id:'manager'}}},
 '@/lib/supabase/service':{createSupabaseServiceClient:()=>db},
 '@/lib/supabase/fetch-all':{fetchAllSupabaseRows:async f=>(await f()).data,fetchSupabaseRowsForIds:async(ids,f)=>(await f(ids)).data},
 '@/lib/email/invitation-recipients':load('../../src/lib/email/invitation-recipients.ts'),
 '@/lib/email/templates':load('../../src/lib/email/templates.ts')
}).prepareCorrectedRecipientsAction;
function reset(){
 calls=[];denied=false;
 tables={
 email_batches:[{id:53,event_id:497,template_id:1,created_at:'2026-11-18',status:'completed_with_errors'}],
 email_templates:[{id:1,subject:'Invito {{nome}}',body_text:'Gentile {{nome}}',updated_at:'2026-11-17'}],
 events:[{id:497,title:'Evento',starts_at:'2026-11-18',location:null,parts:[]}],
 email_logs:[1,2,3].map(id=>({id,batch_id:53,event_id:497,invitation_id:id,status:'skipped',to_email:'email-mancante',personalized_badge:null})),
 event_invitations:[1,2,3].map(id=>({id,event_id:497,updated_at:'2026-11-18',invitation_status:'selected',part_responses:[],contacts:{
 first_name:'Persona'+id,last_name:'Test',email:id===1?'corrected@example.org':id===2?null:'bad@example.org.',email_2:null,updated_at:'2026-11-18',deleted_at:null}}))
 };
}
reset();const result=await action(497,53);assert.equal(result.count,1);
assert.equal(calls[0].args.p_messages[0].to_email,'corrected@example.org');
assert.equal(calls[0].args.p_messages[0].subject,'Invito Persona1');
assert.equal(calls[0].args.p_messages[0].source_log_id,1);
assert.equal(calls[0].args.p_source_batch_id,53);
reset();await action(498,53);assert.equal(calls.length,0);
reset();tables.email_templates[0].updated_at='2026-11-19';assert.equal((await action(497,53)).status,'error');assert.equal(calls.length,0);
reset();tables.email_logs[0].personalized_badge={};assert.equal((await action(497,53)).status,'error');
reset();tables.events[0].parts=[{id:'a',title:'Parte'}];assert.equal((await action(497,53)).status,'error');
reset();tables.email_batches[0].status='sending';assert.equal((await action(497,53)).status,'error');
reset();denied=true;await assert.rejects(action(497,53),/Forbidden/);assert.equal(calls.length,0);
console.log('Recovery preparation: corrected addresses only, personalization, event scope, manager access, changed-template/badge/part guards passed. No email or real-data changes.');
