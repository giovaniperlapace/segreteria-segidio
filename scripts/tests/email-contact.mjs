import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../../src/app/dashboard/events/email-contact-actions.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let denied=false, writes=[], log={id:1,batch_id:53,event_id:497,contact_id:9,status:'skipped',to_email:'email-mancante'};
const db={from(table){
  let filters=[],patch;
  const query={
    select(){return query;},eq(k,v){filters.push(r=>r[k]===v);return query;},
    is(k,v){filters.push(r=>(r[k]??null)===v);return query;},
    update(value){patch=value;return query;},
    async maybeSingle(){
      const row=table==='email_logs'?log:{id:9,deleted_at:null};
      if(!filters.every(f=>f(row)))return{data:null,error:null};
      if(patch)writes.push({table,patch});
      return{data:{...row,...patch},error:null};
    }
  };return query;
}};
const mocks={'next/cache':{revalidatePath(){}},'@/lib/auth/profile':{requireManager:async()=>{if(denied)throw Error('Forbidden');return{id:'manager'};}},'@/lib/supabase/service':{createSupabaseServiceClient:()=>db}};
const mod={exports:{}};new Function('require','module','exports',js)(id=>mocks[id],mod,mod.exports);
const save=mod.exports.saveMissingRecipientEmailAction;
for(const bad of ['a@example.org.','a..b@example.org','a@example.org;b@example.org','a@-example.org','a@example..org','']){
  assert.equal((await save(497,53,1,bad)).status,'error');
}
assert.equal(writes.length,0);
assert.equal((await save(498,53,1,'a@example.org')).status,'error','event scope enforced');
assert.equal((await save(497,54,1,'a@example.org')).status,'error','batch scope enforced');
log.status='sent';assert.equal((await save(497,53,1,'a@example.org')).status,'error');
log.status='skipped';log.to_email='other@example.org';
assert.equal((await save(497,53,1,'a@example.org')).status,'error','suppressed recipients excluded');
log.to_email='email-mancante';
const result=await save(497,53,1,' a@example.org ');
assert.equal(result.status,'success');assert.equal(result.email,'a@example.org');
assert.deepEqual(writes,[{table:'contacts',patch:{email:'a@example.org',updated_by_profile_id:'manager'}}]);
denied=true;await assert.rejects(save(497,53,1,'b@example.org'),/Forbidden/);
assert.equal(writes.length,1);
console.log('Missing recipient email: validation, scope, role, audit attribution and contact-only update passed. No real data modified.');
