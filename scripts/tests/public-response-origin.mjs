import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../../src/lib/email/public-response-links.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext,target: ts.ScriptTarget.ES2022}}).outputText;
const {appBaseUrl, publicResponseUrl, normalizePublicResponseUrl, appendPublicResponseLink,removePublicResponseLink} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
delete process.env.PUBLIC_APP_URL; delete process.env.VERCEL_URL;
for (const origin of ['http://localhost:3000','http://127.0.0.1:3000','http://[::1]:3000']) {
 process.env.APP_URL=origin;
 assert.equal(publicResponseUrl('test-token'),'https://archivio-segreteria.segidio.org/risposta/test-token');
 assert.equal(normalizePublicResponseUrl(`${origin}/risposta/test-token`),publicResponseUrl('test-token'));
}
const old='http://localhost:3000/risposta/test-token';
const original=appendPublicResponseLink({text:'Invito',html:null,responseUrl:old});
const fixed=appendPublicResponseLink({...removePublicResponseLink({...original,responseUrl:old}),responseUrl:normalizePublicResponseUrl(old)});
assert.equal(fixed.text.includes('localhost'),false);
assert.equal(fixed.html.includes('localhost'),false);
process.env.APP_URL='https://preview.example.org';
assert.equal(appBaseUrl(),'https://preview.example.org');
process.env.PUBLIC_APP_URL='https://archivio-segreteria.segidio.org';
assert.equal(appBaseUrl(),process.env.PUBLIC_APP_URL);
console.log('Public email origins and cached local link repair: passed');
