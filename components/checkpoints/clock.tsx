"use client";
import { useEffect, useState } from "react";
export function CheckpointClock({deadlineAt, serverNow}: {deadlineAt:string;serverNow:string}) {
 const [remaining,setRemaining]=useState(Math.max(0,Date.parse(deadlineAt)-Date.parse(serverNow)));
 useEffect(()=>{const origin=Date.now(), initial=Date.parse(serverNow);const timer=setInterval(()=>setRemaining(Math.max(0,Date.parse(deadlineAt)-initial-(Date.now()-origin))),1000);return()=>clearInterval(timer);},[deadlineAt,serverNow]);
 return <div className="mb-4 rounded-xl border bg-sheet p-4" role="timer">检查点 · 剩余 {Math.floor(remaining/60000)}:{String(Math.floor(remaining/1000)%60).padStart(2,"0")}<p className="text-xs text-muted-foreground">40 分钟从开始计时，刷新不重置。超时仍可提交评分，但不计入基线与趋势。AI 实验性预估。</p></div>;
}
