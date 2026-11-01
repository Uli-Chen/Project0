"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
type Status = {enabled:boolean;state:string;candidateQuestionId?:string;candidateText?:string;attemptId?:string};
export function CheckpointInvitation() {
 const [state,setState]=useState<Status|null>(null),[declaration,setDeclaration]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);const router=useRouter();
 const refresh=()=>fetch("/api/checkpoints").then(r=>r.json()).then(setState);
 useEffect(()=>{void refresh();},[]);
 async function act(skip=false){setBusy(true);setError("");try{const r=await fetch(`/api/checkpoints/${skip?"skip":"start"}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(skip?{}:{questionId:state?.candidateQuestionId,declaration,idempotencyKey:crypto.randomUUID()})});const data=await r.json();if(!r.ok){setError((typeof data.error === "string" ? data.error : data.error?.message)??data.message??"当前不能开始，请刷新候选题。");setDeclaration("");await refresh();return;}if(data.session)router.push(`/essays/${data.session.id}`);else await refresh();}catch{setError("连接失败，请重试。");}finally{setBusy(false);}}
 async function repeatMock(){setBusy(true);setError("");try{const response=await fetch("/api/sessions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"free",mode:"mock"})});const data=await response.json();if(!response.ok)throw new Error(typeof data.error === "string" ? data.error : "暂时不能开始");router.push(`/essays/${data.session.id}`);}catch(e){setError(e instanceof Error?e.message:"连接失败");}finally{setBusy(false);}}
 if(!state?.enabled||state.state==="not_due"||state.state==="deferred")return null;
 return <section className="rounded-xl border bg-sheet p-5"><h2 className="font-medium">写作检查点</h2><p className="my-2 text-sm text-muted-foreground">40 分钟、无辅导原稿；题目在本应用中未练过，并由你确认未在外部练习。不能证明你从未见过题目。</p>{state.state==="in_progress"?<Link href={`/essays/${state.attemptId}`}>继续检查点</Link>:state.state==="unavailable"?<p>暂时没有合格题目。可在作文库开始普通模考（不计入检查点基线或趋势）。<Button className="ml-2" variant="outline" disabled={busy} onClick={repeatMock}>开始普通模考（不计入基线）</Button></p>:<><p className="my-3 text-sm">{state.candidateText}</p><p className="text-xs text-muted-foreground">练习题（非官方真题）</p><label className="block text-sm">你是否在其他地方练过这道题？<select className="ml-2 rounded border p-2" value={declaration} onChange={e=>setDeclaration(e.target.value)}><option value="">请选择</option><option value="no">没有</option><option value="yes">练过</option><option value="unsure">不确定</option></select></label><div className="mt-3 flex gap-3"><Button disabled={busy||!declaration} onClick={()=>act()}>开始检查点</Button><Button variant="outline" disabled={busy} onClick={()=>act(true)}>七天后提醒</Button></div></>}{error&&<p role="alert" className="mt-2 text-sm">{error}</p>}</section>;
}
