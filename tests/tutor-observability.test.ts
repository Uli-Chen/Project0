import assert from 'node:assert/strict';
import { test,after } from 'node:test';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { z } from 'zod';
import { getDb } from '../lib/db/client';
import { generateJson } from '../lib/llm/client';
import { callSites } from '../lib/llm/call-sites';
import { cleanCallPayloads } from '../lib/llm/payloads';
const dir=mkdtempSync(join(tmpdir(),'at-observe-'));process.env.DATABASE_PATH=join(dir,'test.db');process.env.LLM_API_KEY='offline';process.env.LLM_PAYLOADS_ENABLED='true';
const db=getDb(),sql=db.$client;migrate(db,{migrationsFolder:resolve('drizzle')});
sql.prepare('INSERT INTO users(id,email,name,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('u','t@example.invalid','Test','x','2026-11-01','2026-11-01');
sql.prepare('INSERT INTO writing_sessions(id,user_id,state_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('s','u','{}','2026-11-01','2026-11-01');
after(()=>{sql.close();rmSync(dir,{recursive:true,force:true})});
test('all sites record metadata, payload, successful callId and reasoning usage',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"reply":"fine"}',reasoning_content:'PRIVATE_REASON'}}],usage:{prompt_tokens:4,completion_tokens:8,completion_tokens_details:{reasoning_tokens:3}}})));
 for(const [site,definition] of Object.entries(callSites)){let id='';await generateJson('test',{student:'own text'},z.object({reply:z.string()}),{userId:'u',sessionId:'s',operationId:'op',purpose:definition.purpose,callSite:site as keyof typeof callSites,onSuccess:m=>{id=m.callId},resultMetadata:()=>({move:'ask',allowedHelp:1,providedHelp:0,warnings:{questions:1}})});const row=sql.prepare('SELECT * FROM llm_calls WHERE id=?').get(id) as Record<string,unknown>;assert.equal(row.call_site,site);assert.equal(row.stage_group,definition.group);assert.equal(row.reasoning_tokens,3);assert.equal(row.finish_reason,'stop');assert.equal(row.move,'ask');const payload=sql.prepare('SELECT * FROM llm_call_payloads WHERE call_id=?').get(id);assert.ok(payload);assert.ok(!JSON.stringify(payload).includes('PRIVATE_REASON'));assert.ok(!JSON.stringify(payload).includes('Authorization'));}
});
test('invalid truncated attempt is recorded separately and message associates successful retry',async t=>{
 let n=0,id='';t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({choices:[{finish_reason:++n===1?'length':'stop',message:{content:'{"reply":"fine"}'}}]})));
 await generateJson('test',{},z.object({reply:z.string()}),{userId:'u',sessionId:'s',operationId:'retry',purpose:'writing_chat',callSite:'deep.chat',onSuccess:m=>{id=m.callId}});
 const rows=sql.prepare('SELECT * FROM llm_calls WHERE operation_id=? ORDER BY rowid').all('retry') as Record<string,unknown>[];assert.equal(rows.length,2);assert.equal(rows[0].outcome,'invalid_output');assert.equal(rows[0].finish_reason,'length');assert.equal(rows[1].id,id);
});
test('payload failure is nonfatal; expiry bounded; deleting session cascades content and late writes fail',async t=>{
 t.mock.method(console,'error',()=>{});t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"reply":"fine"}'}}]})));
 sql.exec("CREATE TRIGGER deny_payload BEFORE INSERT ON llm_call_payloads BEGIN SELECT RAISE(ABORT,'private'); END");
 await generateJson('test',{},z.object({reply:z.string()}),{userId:'u',sessionId:'s',purpose:'writing_chat',callSite:'deep.chat'});sql.exec('DROP TRIGGER deny_payload');
 sql.prepare("UPDATE llm_call_payloads SET expires_at='2020-01-01'").run();assert.ok(cleanCallPayloads()>0);
 sql.prepare("DELETE FROM writing_sessions WHERE id='s'").run();await generateJson('test',{},z.object({reply:z.string()}),{userId:'u',sessionId:'s',purpose:'writing_chat',callSite:'deep.chat'});assert.equal((sql.prepare('SELECT count(*) n FROM llm_call_payloads').get() as {n:number}).n,0);
});
test('Deep timeout-like disconnect retains legacy wording without misclassifying observed outcome',async t=>{
 t.mock.method(console,'error',()=>{});t.mock.method(globalThis,'fetch',async()=>{throw new DOMException('connection aborted','AbortError')});
 await assert.rejects(generateJson('test',{},z.object({reply:z.string()}),{userId:'u',sessionId:'s',operationId:'abort',purpose:'writing_chat',callSite:'deep.chat'}),/模型响应超时，请重试。你的文字已经保留/);
 assert.equal((sql.prepare("SELECT outcome FROM llm_calls WHERE operation_id='abort'").get() as {outcome:string}).outcome,'indeterminate');
});
test('account deletion removes both payloads and call records',async t=>{
 sql.prepare('INSERT INTO writing_sessions(id,user_id,state_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('s','u','{}','2026-11-01','2026-11-01');
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"reply":"fine"}'}}]})));
 await generateJson('test',{},z.object({reply:z.string()}),{userId:'u',sessionId:'s',purpose:'writing_chat',callSite:'deep.chat'});
 assert.ok((sql.prepare('SELECT count(*) n FROM llm_call_payloads').get() as {n:number}).n>0);
 sql.prepare("DELETE FROM users WHERE id='u'").run();
 assert.equal((sql.prepare('SELECT count(*) n FROM llm_call_payloads').get() as {n:number}).n,0);
 assert.equal((sql.prepare('SELECT count(*) n FROM llm_calls').get() as {n:number}).n,0);
});
test('payload retention stays off unless LLM_PAYLOADS_ENABLED is literally true',async t=>{
 sql.prepare('INSERT OR IGNORE INTO users(id,email,name,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('u2','t2@example.invalid','Test','x','2026-11-01','2026-11-01');
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"reply":"fine"}'}}]})));
 const previous=process.env.LLM_PAYLOADS_ENABLED;
 try{for(const value of [undefined,'false','1']){if(value===undefined)delete process.env.LLM_PAYLOADS_ENABLED;else process.env.LLM_PAYLOADS_ENABLED=value;let id='';
  await generateJson('test',{student:'own text'},z.object({reply:z.string()}),{userId:'u2',purpose:'writing_chat',callSite:'deep.chat',onSuccess:m=>{id=m.callId}});
  assert.ok(sql.prepare('SELECT id FROM llm_calls WHERE id=?').get(id));assert.equal(sql.prepare('SELECT call_id FROM llm_call_payloads WHERE call_id=?').get(id),undefined);}}
 finally{if(previous===undefined)delete process.env.LLM_PAYLOADS_ENABLED;else process.env.LLM_PAYLOADS_ENABLED=previous;}
});
