"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
type Status = {enabled:boolean;state:string;candidateQuestionId?:string;candidateText?:string;attemptId?:string};
export function CheckpointInvitation({ fallback = null }: { fallback?: React.ReactNode } = {}) {
 const [state,setState]=useState<Status|null>(null),[declaration,setDeclaration]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);const router=useRouter();
 const refresh=()=>fetch("/api/checkpoints").then(r=>r.json()).then(setState);
 useEffect(()=>{void refresh();},[]);
 async function act(skip=false){setBusy(true);setError("");try{const r=await fetch(`/api/checkpoints/${skip?"skip":"start"}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(skip?{}:{questionId:state?.candidateQuestionId,declaration,idempotencyKey:crypto.randomUUID()})});const data=await r.json();if(!r.ok){setError((typeof data.error === "string" ? data.error : data.error?.message)??data.message??"当前不能开始，请刷新候选题。");setDeclaration("");await refresh();return;}if(data.session)router.push(`/essays/${data.session.id}`);else await refresh();}catch{setError("连接失败，请重试。");}finally{setBusy(false);}}
 async function repeatMock(){setBusy(true);setError("");try{const response=await fetch("/api/sessions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"free",mode:"mock"})});const data=await response.json();if(!response.ok)throw new Error(typeof data.error === "string" ? data.error : "暂时不能开始");router.push(`/essays/${data.session.id}`);}catch(e){setError(e instanceof Error?e.message:"连接失败");}finally{setBusy(false);}}
 if(!state?.enabled)return null;
 if(state.state==="not_due"||state.state==="deferred")return <>{fallback}</>;
 return <section className="flex flex-wrap items-start gap-4 rounded-2xl bg-sunk px-6 py-5">
  <span className="grid size-9 shrink-0 place-items-center rounded-full border bg-sheet text-muted-foreground" aria-hidden><Clock className="size-4.5" /></span>
  <div className="min-w-0 flex-1">
   <h2 className="font-medium">写作检查点</h2>
   <p className="mt-0.5 text-[15px] text-muted-foreground">40 分钟独立完成的模考，用一道你没练过的题，记录不靠教练时的真实水平。</p>
   {state.state==="in_progress"?<Link href={`/essays/${state.attemptId}`} className={buttonVariants({variant:"outline",size:"sm",className:"mt-3"})}>继续检查点</Link>
   :state.state==="unavailable"?<div className="mt-3 flex flex-wrap items-center gap-3"><p className="text-[14px]">暂时没有合格题目。可在作文库开始普通模考（不计入检查点基线或趋势）。</p><Button size="sm" variant="outline" disabled={busy} onClick={repeatMock}>开始普通模考（不计入基线）</Button></div>
   :<div className="mt-3 rounded-lg border bg-sheet p-4"><p className="font-serif text-[16px] leading-relaxed">{state.candidateText}</p><label className="mt-3 flex flex-wrap items-center gap-2 text-sm">你是否在其他地方练过这道题？<select className="h-8 rounded-md border border-input bg-sunk px-2 text-sm" value={declaration} onChange={e=>setDeclaration(e.target.value)}><option value="">请选择</option><option value="no">没有</option><option value="yes">练过</option><option value="unsure">不确定</option></select></label><div className="mt-3 flex gap-2.5"><Button size="sm" variant="outline" disabled={busy||!declaration} onClick={()=>act()}>开始检查点</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>act(true)}>七天后提醒</Button></div></div>}
   {error&&<p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
  </div>
 </section>;
}
