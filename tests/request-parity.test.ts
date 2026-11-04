import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { generateJson } from '../lib/llm/client';
import { prompt, type PromptName } from '../lib/llm/prompts';
import { callSites, type CallSite } from '../lib/llm/call-sites';
import { modelMessages } from '../lib/llm/projection';
import { coachSchema, prewriteSchema, evaluationSchema, comparisonSchema, finishSchema } from '../lib/pipeline/schemas';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/request-b0.json',import.meta.url),'utf8')) as {commit:string;fixtures:{site:CallSite;name:PromptName;body:string}[]};
const schemas:Record<CallSite,z.ZodType>={
  'deep.chat':coachSchema,'deep.clarify':coachSchema,'deep.polish':coachSchema,'deep.express':coachSchema,'deep.check':coachSchema,'deep.issue':coachSchema,
  'deep.prewrite':prewriteSchema,'deep.nudge':z.object({message:z.string().max(500).nullable(),code:z.string().max(30)}),
  'deep.evaluate':evaluationSchema,'deep.compare':comparisonSchema,'deep.review':evaluationSchema.shape.review,'deep.finish':finishSchema,
  'quick.followup':z.object({question:z.string().min(1).max(80),targetKey:z.string().nullable()}).strict(),
  'quick.check':z.object({results:z.array(z.object({id:z.string(),status:z.enum(['met','gap']),note:z.string().max(60).nullable()}).strict())}).strict(),
};
test('B0: 14 logical call schemas and actual fetch bytes match immutable 90f5655 capture',async t=>{
  assert.equal(fixtures.commit,'90f5655');assert.equal(fixtures.fixtures.length,14);
  const env={key:process.env.LLM_API_KEY,model:process.env.LLM_MODEL,url:process.env.LLM_BASE_URL};
  process.env.LLM_API_KEY='offline';process.env.LLM_MODEL='deepseek-flash';process.env.LLM_BASE_URL='https://api.deepseek.com';
  try{for(const f of fixtures.fixtures){let body='';t.mock.method(globalThis,'fetch',async(_url: unknown,init?: RequestInit)=>{body=String(init?.body);return new Response('{}',{status:503})});await assert.rejects(generateJson(prompt(f.name),{task:'Fixed task',student:'My own reason',conversation:[]},schemas[f.site],{callSite:f.site,purpose:callSites[f.site].purpose,...(f.site.startsWith('quick')?{maxOutputTokens:f.site==='quick.check'?768:512}:{})}));assert.equal(body,f.body,f.site);}}finally{for(const [key,value] of Object.entries({LLM_API_KEY:env.key,LLM_MODEL:env.model,LLM_BASE_URL:env.url})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
test('new call metadata does not enter next-turn history; legacy order and optional fields survive',()=>{
 const old={id:'m1',role:'coach' as const,stage:'writing' as const,content:'Question?',action:'chat' as const};
 assert.equal(JSON.stringify(modelMessages([{...old,callId:'private-call'}])),JSON.stringify([old]));
});
test('B0: real runAction dispatch contexts match legacy capture at all 12 sites and both assist stages',async t=>{
 const {runAction}=await import('../lib/pipeline/engine');
 type Fixture={name:string;state:Parameters<typeof runAction>[0];input:Parameters<typeof runAction>[1];profile:Parameters<typeof runAction>[4];bodies:string[];responses:unknown[]};
 const baseline=JSON.parse(readFileSync(new URL('./fixtures/engine-b0.json',import.meta.url),'utf8')) as {commit:string;fixtures:Fixture[]};
 const old={key:process.env.LLM_API_KEY,model:process.env.LLM_MODEL,url:process.env.LLM_BASE_URL,flag:process.env.TUTOR_V2_ENABLED};
 process.env.LLM_API_KEY='offline';process.env.LLM_MODEL='deepseek-flash';process.env.LLM_BASE_URL='https://api.deepseek.com';process.env.TUTOR_V2_ENABLED='false';
 try{for(const f of baseline.fixtures){
   const bodies:string[]=[];t.mock.method(globalThis,'fetch',async(_url:unknown,init?:RequestInit)=>{bodies.push(String(init?.body));const response=f.responses[bodies.length-1];return response?new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(response)}}]})):new Response('{}',{status:503})});
   const state=structuredClone(f.state);for(const m of state.messages)m.callId='new-observation-id';
   try{await runAction(state,f.input,()=>{},[],f.profile)}catch{}
   assert.ok(f.bodies.length>0,f.name);assert.deepEqual(bodies,f.bodies,f.name);
 }}finally{for(const [key,value] of Object.entries({LLM_API_KEY:old.key,LLM_MODEL:old.model,LLM_BASE_URL:old.url,TUTOR_V2_ENABLED:old.flag})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
test('prompt fingerprint includes actual schema and only dispatched retry files',async()=>{
 const {promptFingerprint}=await import('../lib/llm/prompts');const {buildMessages}=await import('../lib/llm/messages');
 const instruction=prompt('coach/chat');
 const first=buildMessages(instruction,{},z.object({reply:z.string()}),0)[0].content;
 const changed=buildMessages(instruction,{},z.object({reply:z.string().max(100)}),0)[0].content;
 const retry=buildMessages(instruction,{},z.object({reply:z.string()}),1)[0].content;
 const a=promptFingerprint(instruction,false,false,first),b=promptFingerprint(instruction,false,false,changed),c=promptFingerprint(instruction,false,true,retry);
 assert.notEqual(a,b);assert.notEqual(a,c);assert.equal(a,promptFingerprint(instruction,false,false,first));
 assert.ok(!JSON.parse(a).files.some((f:{name:string})=>f.name==='system/retry'));assert.ok(JSON.parse(c).files.some((f:{name:string})=>f.name==='system/retry'));
 assert.ok(!a.includes(instruction));
});
