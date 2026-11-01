import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { quickFixture } from './helpers/quick-api';
import { inRequest } from './helpers/request-context';
import { essay, evaluation } from './helpers/practice-db';
import { GET as READ } from '../app/api/sessions/[id]/route';
import { GET as TOPICS } from '../app/api/topics/route';
import { POST as CHECKPOINT } from '../app/api/checkpoints/start/route';
import { getSession } from '../lib/db/queries/sessions';
const f=quickFixture();after(()=>f.close());
test('all release flags off: legacy create/read/save/evaluate work, new entrypoints reject, Quick stays read-only',async()=>{
 const quick=await f.call('create','',{questionId:'qb_mock_health_001',activity:'quick',mode:'practice',idempotencyKey:'before-close'});assert.equal(quick.status,201);const quickId=(await quick.json()).session.id;
 for(const flag of ['QUESTION_BANK_ENABLED','QUICK_ENABLED','CHECKPOINTS_ENABLED','FOCUS_ENABLED']) process.env[flag]='false';
 const created=await f.call('create','',{kind:'free',mode:'mock',prompt:'Some people believe that universities should be free for all students. To what extent do you agree or disagree?'});assert.equal(created.status,201);const state=(await created.json()).session;
 const patch=await f.call('patch',state.id,{version:state.version,drafts:{original:essay,revision:''}});assert.equal(patch.status,200);
 const request=new Request(`http://quick.test/api/sessions/${state.id}`,{headers:{cookie:`wm_session=${'a'.repeat(64)}`}});
 const read=await inRequest(request,()=>READ(request,{params:Promise.resolve({id:state.id})}));assert.equal(read.status,200);assert.equal((await read.json()).session.drafts.original,essay);
 assert.equal((await f.call('create','',{questionId:'qb_mock_health_001',activity:'deep',mode:'practice',idempotencyKey:'disabled'})).status,403);
 assert.equal((await inRequest(request,()=>TOPICS())).status,403);
 const cpRequest=new Request('http://quick.test/api/checkpoints/start',{method:'POST',headers:{origin:'http://quick.test',cookie:`wm_session=${'a'.repeat(64)}`,'content-type':'application/json'},body:JSON.stringify({questionId:'qb_mock_health_001',declaration:'no',idempotencyKey:'disabled-cp'})});
 assert.equal((await inRequest(cpRequest,()=>CHECKPOINT(cpRequest))).status,403);
 assert.equal((await f.call('quick',quickId)).status,409);assert.equal((await f.call('action',quickId,{action:'continueDeep',explicitNew:false})).status,409);assert.equal((await f.call('patch',quickId,{version:0})).status,409);
 const quickRead=await inRequest(request,()=>READ(request,{params:Promise.resolve({id:quickId})}));assert.equal(quickRead.status,200);
 const originalFetch=globalThis.fetch,key=process.env.LLM_API_KEY;process.env.LLM_API_KEY='test-only';let calls=0;
 globalThis.fetch=async(_url,init)=>{calls++;const messages=JSON.parse(init!.body as string).messages;assert.ok(JSON.stringify(messages).includes('Evaluate ONLY the supplied essay and task'));return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(evaluation)}}]});};
 try{assert.equal((await f.call('action',state.id,{action:'evaluate',kind:'original',requestId:crypto.randomUUID()})).status,200);assert.equal(calls,1);assert.equal(getSession('u',state.id)!.stage,'feedback');assert.ok(getSession('u',state.id)!.completedAt);}finally{globalThis.fetch=originalFetch;if(key===undefined)delete process.env.LLM_API_KEY;else process.env.LLM_API_KEY=key;}
});
