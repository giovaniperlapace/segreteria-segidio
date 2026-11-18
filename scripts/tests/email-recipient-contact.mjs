import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

let denied=false;
const tables={
 email_logs:[{id:7,event_id:497,batch_id:53,contact_id:9}],
 contacts:[{id:9,first_name:'Anna',last_name:'Test',deleted_at:null}],
 contact_groups:[{contact_id:9,group_id:3}],
 contact_references:[{contact_id:9,reference_id:4}],
 contacts_missing_required_data:[{id:9,missing_fields:['email']}],
 event_invitations:[],
 groups:[{id:3,name:'Gruppo',active:true}],
 internal_references:[{id:4,full_name:'Referente',active:true,deleted_at:null}],
 contact_languages:[{id:1,name:'Italiano',active:true}],
};
const db={from(table){
 let predicates=[],single=false;
 const q={select(){return q},eq(k,v){predicates.push(r=>r[k]===v);return q},
 is(k,v){predicates.push(r=>(r[k]??null)===v);return q},order(){return q},
 maybeSingle(){single=true;return q},
 then(resolve){const rows=tables[table].filter(r=>predicates.every(f=>f(r)));return Promise.resolve({data:single?rows[0]??null:rows,error:null}).then(resolve)}};
 return q;
}};
const mocks={
 'next/cache':{revalidatePath(){}},
 '@/lib/auth/profile':{requireManager:async()=>{if(denied)throw Error('Forbidden')}},
 '@/lib/auth/admin':{},
 '@/lib/supabase/fetch-all':{fetchAllSupabaseRows:async factory=>(await factory()).data},
 '@/lib/supabase/server':{},
 '@/lib/supabase/service':{createSupabaseServiceClient:()=>db},
};
const source=readFileSync(new URL('../../src/app/dashboard/archive-actions.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
new Function('require','module','exports',compiled)(id=>{if(!(id in mocks))throw Error(id);return mocks[id]},mod,mod.exports);
const load=mod.exports.loadEmailRecipientContactAction;
const result=await load(497,53,7);
assert.equal(result.status,'success');
assert.deepEqual(result.contact.group_ids,[3]);
assert.deepEqual(result.contact.reference_ids,[4]);
assert.deepEqual(result.contact.missing_fields,['email']);
assert.equal(result.references[0].name,'Referente');
assert.equal(result.languages[0].name,'Italiano');
assert.equal((await load(498,53,7)).status,'error');
assert.equal((await load(497,54,7)).status,'error');
assert.equal((await load(497,53,-1)).status,'error');
tables.contacts[0].deleted_at='2026-11-18';
assert.equal((await load(497,53,7)).status,'error');
denied=true;await assert.rejects(load(497,53,7),/Forbidden/);
console.log('Recipient contact: manager access, event/batch scope, deleted contacts and complete associations passed. No real data modified.');
