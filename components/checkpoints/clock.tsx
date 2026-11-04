"use client";
import { useEffect, useState } from "react";
export function CheckpointClock({ deadlineAt, serverNow, sessionId, originalSubmittedAt = null }: { deadlineAt: string; serverNow: string; sessionId?: string; originalSubmittedAt?: string | null }) {
  const [remaining, setRemaining] = useState(Math.max(0, Date.parse(deadlineAt) - Date.parse(serverNow)));
  const [receivedAt, setReceivedAt] = useState<string | null>(null);
  const submittedAt = originalSubmittedAt ?? receivedAt;
  useEffect(() => {
    if (submittedAt) return;
    const origin = Date.now(), initial = Date.parse(serverNow);
    const timer = setInterval(() => setRemaining(Math.max(0, Date.parse(deadlineAt) - initial - (Date.now() - origin))), 1000);
    return () => clearInterval(timer);
  }, [deadlineAt, serverNow, submittedAt]);
  useEffect(() => {
    if (!sessionId || submittedAt) return;
    let cancelled = false, inFlight = false;
    const controller = new AbortController();
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch(`/api/sessions/${sessionId}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const result = await response.json();
        // An optimistic evaluate state is not evidence. Stop only after the
        // server has durably accepted the immutable original snapshot.
        const accepted = result.session?.originalSubmittedAt;
        if (!cancelled && typeof accepted === "string" && Number.isFinite(Date.parse(accepted))) setReceivedAt(accepted);
      } catch { /* Keep the original countdown while status is unavailable. */ }
      finally { inFlight = false; }
    };
    const first = setTimeout(() => void poll(), 0), timer = setInterval(() => void poll(), 1500);
    return () => { cancelled = true; controller.abort(); clearTimeout(first); clearInterval(timer); };
  }, [sessionId, submittedAt]);
  if (submittedAt) return <div className="sunk mb-4 px-5 py-3.5 text-sm font-medium" role="status">检查点已提交，计时结束<p className="mt-0.5 text-xs font-normal text-muted-foreground">{Date.parse(submittedAt) <= Date.parse(deadlineAt) ? "原稿已在截止前提交；等待评分不会占用作答时间。" : "原稿在截止后提交，仍可获得反馈，但不计入基线与趋势。"} AI 实验性预估。</p></div>;
  return <div className="surface mb-4 flex flex-wrap items-baseline gap-x-3 px-5 py-3.5 text-sm" role="timer"><span className="font-medium">检查点剩余</span><span className="font-serif text-[22px] leading-none font-medium tabular-nums">{Math.floor(remaining / 60000)}:{String(Math.floor(remaining / 1000) % 60).padStart(2, "0")}</span><p className="w-full pt-1 text-xs text-muted-foreground">40 分钟从开始计时，刷新不重置。超时仍可提交评分，但不计入基线与趋势。AI 实验性预估。</p></div>;
}
