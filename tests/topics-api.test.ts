import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { quickFixture } from './helpers/quick-api';
import { inRequest } from './helpers/request-context';
import { GET } from '../app/api/topics/route';
import { GET as DETAIL } from '../app/api/topics/[topic]/route';
import { getTopicData } from '../lib/db/queries/topics';
import { completionEvents } from '../lib/db/schema';
const f=quickFixture();after(()=>f.close());
function request(token='a'.repeat(64)){return new Request('http://quick.test/api/topics',{headers:{cookie:`wm_session=${token}`}});}
test('Topics API authenticates, respects flag and isolates retained completed evidence',async()=>{
 let response=await inRequest(request(''),()=>GET());assert.equal(response.status,401);
 const initial=getTopicData('u');assert.equal(initial.questions.length,38);assert.ok(initial.topics.length);
 const q=initial.questions[0];const created=await f.call('create','',{questionId:q.id,activity:'quick',mode:'practice',idempotencyKey:crypto.randomUUID()});assert.equal(created.status,201);const id=(await created.json()).session.id;
 f.db.insert(completionEvents).values({userId:'u',attemptId:id,activity:'quick',exposureKey:q.exposureKey,questionId:q.id,primaryTopic:q.primaryTopic,questionType:q.questionType,completedAt:new Date().toISOString(),freshness:'unknown',relation:'none'}).run();
 await f.call('delete',id);
 response=await inRequest(request(),()=>GET());assert.equal(response.status,200);const payload=await response.json();assert.equal(payload.counts.weekCompleted,1);assert.equal(payload.topics.find((t:{topic:string})=>t.topic===q.primaryTopic).completed,1);
 assert.equal(getTopicData('other').counts.weekCompleted,0);
 response=await inRequest(request(),()=>DETAIL(request(),{params:Promise.resolve({topic:q.primaryTopic})}));assert.equal(response.status,200);assert.ok((await response.json()).recommendation);
 response=await inRequest(request(),()=>DETAIL(request(),{params:Promise.resolve({topic:'missing'})}));assert.equal(response.status,404);
 process.env.QUESTION_BANK_ENABLED='false';response=await inRequest(request(),()=>GET());assert.equal(response.status,403);process.env.QUESTION_BANK_ENABLED='true';
});

test('pasted ordinary task retains family blocking without gaining bank topic identity',async()=>{
 const {createSession}=await import('../lib/pipeline/initial');const {saveNewPractice}=await import('../lib/db/create-practice');
 const before=getTopicData('u'),q=before.questions.find(q=>q.pool==='practice')!;
 const session=createSession({kind:'free',mode:'practice',prompt:q.text});session.lifecycle='set_aside';saveNewPractice('u',session);
 const after=getTopicData('u',q.primaryTopic),attempt=after.attempts.find(a=>a.id===session.id)!;
 assert.equal(attempt.exposureKey,q.exposureKey);assert.equal(attempt.questionId,null);
 assert.deepEqual(after.topics.map(t=>t.startedOnly),before.topics.map(t=>t.startedOnly));
 const result=after.recommendation!;if(result.kind==='new'||result.kind==='rewrite')assert.notEqual(result.questionId,q.id);
});
