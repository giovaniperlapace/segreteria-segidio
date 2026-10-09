import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
let verifications=0,lastOtp;
class NextResponse extends Response { static redirect(url,status=307){return new NextResponse(null,{status,headers:{Location:String(url)}});} }
const js=ts.transpileModule(readFileSync(new URL('../../src/app/auth/callback/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m={exports:{}};
new Function('require','module','exports',js)(id=>{
 if(id==='next/server')return {NextResponse};
 if(id==='@/lib/supabase/server')return {createSupabaseServerClient:async()=>({auth:{verifyOtp:async otp=>{verifications++;lastOtp=otp;return{error:otp.token_hash==='valid'?null:Error('invalid')};}}})};
 throw Error('Unexpected import '+id);
},m,m.exports);
const {GET,POST}=m.exports;
const origin='https://archivio-segreteria.segidio.org';
const response=await GET(new Request(origin+'/auth/callback?token_hash=valid&type=magiclink'));
const html=await response.text();assert.match(html,/method="post"/);assert.doesNotMatch(html,/<script|verifyOtp|supabase/);assert.equal(verifications,0);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('referrer-policy'),'strict-origin');
const malicious=await GET(new Request(origin+'/auth/callback?token_hash='+encodeURIComponent('\"><img src=x>')+'&type=magiclink'));assert.doesNotMatch(await malicious.text(),/<img/);
const post=(token='valid',headerOrigin=origin,contentType='application/x-www-form-urlencoded')=>POST(new Request(origin+'/auth/callback',{method:'POST',headers:{origin:headerOrigin,'content-type':contentType},body:new URLSearchParams({token_hash:token,type:'magiclink'})}));
assert.equal((await post('valid','https://evil.example')).status,403);assert.equal((await post('valid','null')).status,403);assert.equal((await post('valid',origin,'application/json')).status,415);assert.equal(verifications,0);
const valid=await post();assert.equal(valid.status,303);assert.equal(valid.headers.get('location'),origin+'/dashboard');assert.equal(verifications,1);assert.deepEqual(lastOtp,{token_hash:'valid',type:'magiclink'});
assert.match((await post('expired')).headers.get('location'),/invalid_link/);
assert.match((await GET(new Request(origin+'/auth/callback'))).headers.get('location'),/invalid_link/);
console.log('Magic links: scanner-safe GET, native confirmation, origin/content-type validation, escaping, OTP and redirects passed. No live tokens used.');
