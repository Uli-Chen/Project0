/** Final bounded two-provider check of uncertainty handling; synthetic prior transcript. */
import { loadEnvConfig } from "@next/env";
import { readFileSync, writeFileSync } from "node:fs";
import { quickFixture } from "../tests/helpers/quick-api";
import { commitQuickMutation } from "../lib/pipeline/quick";
import { runQuickModel } from "../lib/pipeline/quick-model";
import { getSession, saveSession } from "../lib/db/queries/sessions";
async function main() {
 loadEnvConfig(process.cwd()); const f=quickFixture(), originalFetch=globalThis.fetch; let calls=0; const outputs: unknown[]=[];
 globalThis.fetch=async(...args)=>{if(calls>=2)throw new Error("two_call_cap");calls++;const response=await originalFetch(...args);
 try {const payload=await response.clone().json(); const choice=payload?.choices?.[0];const parsed=JSON.parse(choice?.message?.content ?? "{}");outputs.push({finishReason:choice?.finish_reason,question:typeof parsed.question === "string" ? parsed.question.slice(0,200) : null,targetKey:parsed.targetKey ?? null});}catch{outputs.push({invalidJson:true});}return response;};
 try {
  const response=await f.call("create","",{questionId:"qb_mock_edu_004",activity:"quick",mode:"practice",idempotencyKey:crypto.randomUUID()});
  const id=(await response.json()).session.id as string;
  commitQuickMutation("u",id,{action:"cardSave",cardVersion:0,parts:[{key:"position.answer",text:"我赞成学校通常要求学生穿校服。"}]});
  const previous=JSON.parse(readFileSync("docs/plans/reports/WP8_e2e/coach-behavior-16-20-revised.json","utf8")).results.find((r:{caseId:number})=>r.caseId===16);
  f.followup(id); const state=getSession("u",id)!;state.messages[0].content=previous.conversation[0].text;saveSession("u",state);
  commitQuickMutation("u",id,{action:"quickAnswer",text:"不知道为什么。"});
  const start=Date.now(), result=await runQuickModel("u",id,{action:"quickFollowup",cardVersion:1});
  const report={timestamp:new Date().toISOString(),caseId:17,synthetic:true,temporaryDatabase:true,providerCalls:calls,providerCap:2,outputs,latencyMs:Date.now()-start,conversation:result.session.messages.map(m=>({role:m.role,text:m.content})),operations:result.operations.map(o=>({kind:o.kind,status:o.status})),ledger:f.db.$client.prepare("SELECT purpose,attempt,config_version,input_tokens,output_tokens,latency_ms,outcome FROM llm_calls ORDER BY rowid").all()};
  writeFileSync("docs/plans/reports/WP8_e2e/coach-behavior-17-slot-fix.json",JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report));
 } finally {globalThis.fetch=originalFetch;f.close();}
}
main().catch(()=>{console.error("bounded probe failed; no secrets logged");process.exitCode=1;});
