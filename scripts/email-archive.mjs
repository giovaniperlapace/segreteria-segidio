// Administrative local utility. Uses the project's server-only modules and never sends email.
// node --env-file=.env.local scripts/email-archive.mjs --check | --run | --recover-log=123
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';
const require=createRequire(import.meta.url), cache=new Map();
function load(path){path=resolve(path);if(cache.has(path))return cache.get(path).exports;const m={exports:{}};cache.set(path,m);const js=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('require','module','exports',js)(id=>id.startsWith('.')?load(resolve(dirname(path),id+'.ts')):require(id),m,m.exports);return m.exports;}
const archive=load('src/lib/email/sent-archive.ts');
const service=load('src/lib/supabase/service.ts');
const evidence=load('src/lib/email/delivery-evidence.ts');
const arg=process.argv[2];
try {
  if(arg==='--check'){
    const client=archive.archiveClient();
    try{await client.connect();const folder=(await client.list()).find(f=>f.specialUse==='\\Sent');if(!folder)throw Error('Sent missing');console.log({gmailAuthenticated:true,sentFolder:folder.path,enabled:process.env.EMAIL_SENT_ARCHIVE_ENABLED==='true'});}finally{client.close();}
  }else if(arg==='--run') console.log(await archive.processSentArchives());
  else if(/^--recover-log=\d+$/.test(arg??'')){
    const id=Number(arg.split('=')[1]);const db=service.createSupabaseServiceClient();
    const {data:log,error}=await db.from('email_logs').select('id,status,provider_message_id').eq('id',id).single();
    if(error||log?.status!=='sent'||!evidence.isPostmarkId(log.provider_message_id??''))throw Error('Invalid sent Postmark log');
    const {error:queued}=await db.from('email_sent_archives').upsert({email_log_id:id,provider_message_id:log.provider_message_id,recovered:true},{onConflict:'email_log_id',ignoreDuplicates:true});if(queued)throw Error('Queue failed');
    console.log(await archive.processSentArchives({logId:id,limit:1}));
    const {data:saved,error:readback}=await db.from('email_sent_archives').select('email_log_id,status,original_date,recovered,mailbox,mailbox_uid,last_error').eq('email_log_id',id).single();if(readback)throw Error('Readback failed');console.log(saved);
  }else throw Error('Use --check, --run or --recover-log=123');
}catch{console.error('Archive operation failed. Check configuration/access; no email was sent.');process.exitCode=1;}
