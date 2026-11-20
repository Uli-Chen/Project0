import { inRequest } from "./helpers/request-context";
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { POST } from "../app/api/sessions/[id]/actions/route";
import { getDb } from "../lib/db/client";
import { authSessions, users } from "../lib/db/schema";
import { getSession, saveSession } from "../lib/db/queries/sessions";
import { createSession } from "../lib/pipeline/initial";
import type { Evaluation } from "../lib/prototype/types";

const directory=mkdtempSync(join(tmpdir(),"tutor-api-"));
process.env.DATABASE_PATH=join(directory,"db.sqlite");
process.env.APP_ORIGIN="http://tutor.test";
process.env.LLM_API_KEY="offline-only";
const db=getDb(); migrate(db,{migrationsFolder:resolve("drizzle")});
const token="b".repeat(64), originalFetch=globalThis.fetch;
db.insert(users).values({id:"owner",email:"tutor@example.test",name:"Tutor",passwordHash:"fake",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}).run();
db.insert(authSessions).values({tokenHash:createHash("sha256").update(token).digest("hex"),userId:"owner",expiresAt:Date.now()+3600000}).run();
function profile(patch:Record<string,unknown>={}) { db.$client.prepare("UPDATE users SET profile_json=? WHERE id='owner'").run(JSON.stringify({difficulties:["没想法"],excludedMemoryIds:[],explainLanguage:"en",...patch})); }
function state() { const s=createSession({kind:"free",mode:"practice"});saveSession("owner",s);return s; }
async function call(id:string,body:Record<string,unknown>) {
 const request=new Request(`http://tutor.test/api/sessions/${id}/actions`,{method:"POST",headers:{origin:"http://tutor.test","content-type":"application/json",cookie:`wm_session=${token}`},body:JSON.stringify(body)});
 return inRequest(request,()=>POST(request,{params:Promise.resolve({id})}));
}
const valid=(extra:Record<string,unknown>={})=>({move:"ask",reply:"What consequence follows?",track:"argument",help:{level:0},delta:[{op:"ask",text:"What consequence follows?"}],payload:{},...extra});
const response=(value:unknown)=>new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:10,completion_tokens:20}}));
beforeEach(()=>{process.env.TUTOR_V2_ENABLED="true";profile();globalThis.fetch=async()=>{throw new Error("unexpected fetch");};});
after(()=>{globalThis.fetch=originalFetch;db.$client.close();rmSync(directory,{recursive:true,force:true});});
test("tutor requests carry only the explanation language; a late difficulty change no longer invalidates the turn",async()=>{
 const s=state();let release!:()=>void, started!:()=>void, body="";
 const waiting=new Promise<void>(r=>{release=r;}), entered=new Promise<void>(r=>{started=r;});
 globalThis.fetch=async(_url,init)=>{body=String(init?.body);started();await waiting;return response(valid());};
 const pending=call(s.id,{action:"prewrite",text:"My original idea",requestId:crypto.randomUUID()});await entered;profile({difficulties:["changed"],excludedMemoryIds:["self:没想法"]});release();
 const result=await pending;assert.equal(result.status,200);
 const sent=JSON.parse(JSON.parse(body).messages[1].content);assert.deepEqual(sent.learner,{explainLanguage:"en"});
});
test("same request retries frozen language/path after preference and feature changes; fresh request uses new config",async()=>{
 const s=state(), requestId=crypto.randomUUID();const input={action:"prewrite",text:"My idea",requestId};
 globalThis.fetch=async()=>new Response("{}",{status:503});assert.ok((await call(s.id,input)).status>=500);
 profile({explainLanguage:"zh"});process.env.TUTOR_V2_ENABLED="false";
 let body="";globalThis.fetch=async(_url,init)=>{body=String(init?.body);return response(valid());};
 const resumed=await call(s.id,input);assert.equal(resumed.status,200);assert.match(body,/explainLanguage/);assert.match(body,/\\"explainLanguage\\":\\"en\\"/);
 process.env.TUTOR_V2_ENABLED="true";
 globalThis.fetch=async(_url,init)=>{body=String(init?.body);const out=valid();delete (out as {track?:string}).track;return response(out);};
 assert.equal((await call(s.id,{...input,requestId:crypto.randomUUID()})).status,200);assert.match(body,/\\"explainLanguage\\":\\"zh\\"/);
});
for(const tutor of [{v:9,future:"keep"},{v:1,broken:true}]) test(`unreadable tutor ${tutor.v} preserved and rejects before fetch`,async()=>{
 const s=state();db.$client.prepare("UPDATE writing_sessions SET state_json=json_set(state_json,'$.tutor',json(?)) WHERE id=?").run(JSON.stringify(tutor),s.id);
 let calls=0;globalThis.fetch=async()=>{calls++;return response(valid());};
 const result=await call(s.id,{action:"prewrite",text:"My idea",requestId:crypto.randomUUID()});assert.equal(result.status,409);assert.equal(calls,0);
 const saved=getSession("owner",s.id)!;assert.deepEqual(saved.tutor,tutor);assert.deepEqual(saved.messages,s.messages);assert.deepEqual(saved.outline,s.outline);assert.equal(saved.pendingAction?.retryable,false);
});
test("successful hint replay is idempotent and failed hint does not escalate",async()=>{
 const s=state(), input={action:"prewrite",intent:"more",text:"",requestId:crypto.randomUUID()};let count=0;
 globalThis.fetch=async()=>{count++;return response(valid({help:{level:1}}));};
 assert.equal((await call(s.id,input)).status,200);assert.equal((await call(s.id,input)).status,200);assert.equal(count,1);
 const before=getSession("owner",s.id)!;assert.equal(before.tutor?.threads.prewrite.allowedHelp,1);assert.equal(before.prewriteTurns,1);
 globalThis.fetch=async()=>response({invalid:true});assert.ok((await call(s.id,{...input,requestId:crypto.randomUUID()})).status>=500);
 const after=getSession("owner",s.id)!;assert.deepEqual(after.tutor,before.tutor);assert.equal(after.prewriteTurns,1);
});
test("startRevision validates rank before stage/draft update and selects non-primary issue atomically",async()=>{
 const s=state();s.stage="feedback";s.submitted.original="Frozen original.";
 s.evaluation={scores:{overall:6,dims:{TR:6,CC:6,LR:6,GRA:6},rationale:{TR:"r",CC:"r",LR:"r",GRA:"r"}},issues:[1,2].map(rank=>({rank,code:"grammar",title:"Issue",why:"Reason",sentenceIds:[1],hintL1:"Hint",recurring:false})),review:{outlineCoverage:[],breakthrough:null,focusResult:null,selfReportContrast:null,aiRatio:0}} satisfies Evaluation;saveSession("owner",s);
 assert.equal((await call(s.id,{action:"startRevision",openIssue:3,requestId:crypto.randomUUID()})).status,404);
 let saved=getSession("owner",s.id)!;assert.equal(saved.stage,"feedback");assert.equal(saved.drafts.revision,"");
 assert.equal((await call(s.id,{action:"startRevision",openIssue:2,requestId:crypto.randomUUID()})).status,200);
 saved=getSession("owner",s.id)!;assert.equal(saved.stage,"revising");assert.equal(saved.activeIssue,2);assert.equal(saved.drafts.revision,s.submitted.original);
});
for(const mutation of ["version", "thread"] as const) test(`late ${mutation} change invalidates teaching result`,async()=>{
 const s=state();let release!:()=>void, started!:()=>void;
 const wait=new Promise<void>(r=>{release=r;}), entered=new Promise<void>(r=>{started=r;});
 globalThis.fetch=async()=>{started();await wait;return response(valid());};
 const pending=call(s.id,{action:"prewrite",text:"My idea",requestId:crypto.randomUUID()});await entered;
 const latest=getSession("owner",s.id)!;
 if(mutation==="version") latest.version++;
 else latest.tutor={v:1,brief:null,activeThread:null,threads:{},helpEvents:[]};
 saveSession("owner",latest);release();assert.equal((await pending).status,409);
 const saved=getSession("owner",s.id)!;assert.equal(saved.pendingAction?.retryable,false);assert.deepEqual(saved.messages,s.messages);assert.deepEqual(saved.tutor,latest.tutor);
});
test("overlapping more requests cannot double-escalate a thread",async()=>{
 const s=state();let release!:()=>void, started!:()=>void;
 const wait=new Promise<void>(r=>{release=r;}), entered=new Promise<void>(r=>{started=r;});
 globalThis.fetch=async()=>{started();await wait;return response(valid({help:{level:1}}));};
 const input={action:"prewrite",intent:"more",text:"",requestId:crypto.randomUUID()};
 const first=call(s.id,input);await entered;
 assert.equal((await call(s.id,{...input,requestId:crypto.randomUUID()})).status,409);release();assert.equal((await first).status,200);
 assert.equal(getSession("owner",s.id)?.tutor?.threads.prewrite.allowedHelp,1);
});
test("unrecoverable legacy snapshot retains input and refuses provider dispatch",async()=>{
 const s=state(), requestId=crypto.randomUUID();s.pendingAction={requestId,input:{action:"prewrite",text:"Recover my words"},startedAt:new Date().toISOString()};saveSession("owner",s);
 let count=0;globalThis.fetch=async()=>{count++;return response(valid());};
 assert.equal((await call(s.id,{...s.pendingAction.input,requestId})).status,409);assert.equal(count,0);
 assert.equal(getSession("owner",s.id)?.pendingAction?.retryable,false);assert.deepEqual(getSession("owner",s.id)?.pendingAction?.input,s.pendingAction.input);
});
