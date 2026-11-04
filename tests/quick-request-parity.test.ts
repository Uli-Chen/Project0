import assert from 'node:assert/strict';import {test,after} from 'node:test';import {readFileSync} from 'node:fs';
import {quickFixture} from './helpers/quick-api';import {getCard,cardRequirements} from '../lib/db/queries/cards';import {cardSlots} from '../lib/quick/layouts';
const f=quickFixture();after(()=>f.close());
test('B0 real Quick routes preserve followup and check request bytes',async t=>{
 process.env.LLM_API_KEY='offline';process.env.LLM_MODEL='deepseek-flash';process.env.LLM_BASE_URL='https://api.deepseek.com';
 const baseline=JSON.parse(readFileSync(new URL('./fixtures/quick-b0.json',import.meta.url),'utf8')) as {commit:string;bodies:string[]};
 const bodies:string[]=[];t.mock.method(globalThis,'fetch',async(_url:unknown,init?:RequestInit)=>{bodies.push(String(init?.body));const ctx=JSON.parse(JSON.parse(String(init?.body)).messages[1].content);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(bodies.length===1?{question:'为什么会产生这种影响？',targetKey:null}:{results:ctx.requirements.map((r:{id:string})=>({id:r.id,status:'met',note:null}))})}}]})});
 const r=await f.call('create','',{questionId:'qb_mock_health_001',activity:'quick',mode:'practice',idempotencyKey:'b0-fixed'});assert.equal(r.status,201);const id=(await r.json()).session.id;
 assert.equal((await f.call('action',id,{action:'cardSave',cardVersion:0,parts:cardSlots(cardRequirements(getCard('u',id)!)).map(s=>({key:s.key,text:'我的观点及相关原因'}))})).status,200);
 assert.equal((await f.call('action',id,{action:'quickFollowup',cardVersion:1})).status,200);
 assert.equal((await f.call('action',id,{action:'quickCheck',cardVersion:1})).status,200);
 assert.equal(baseline.bodies.length,2);assert.deepEqual(bodies,baseline.bodies);
 const rows=f.db.$client.prepare('SELECT call_site,stage_group FROM llm_calls ORDER BY rowid').all();assert.deepEqual(rows,[{call_site:'quick.followup',stage_group:'quick'},{call_site:'quick.check',stage_group:'judge'}]);
 const response=JSON.stringify(await (await f.call('quick',id)).json());assert.ok(!response.includes('request_json'));assert.ok(!response.includes('response_text'));
});
