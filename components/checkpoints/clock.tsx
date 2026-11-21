"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MIN_EVALUATION_WORDS } from "@/lib/rules/check-input";

// Swapping the question is offered only in the first five minutes of the 40 (the server also requires an empty draft).
const SWAP_UNTIL_REMAINING = 35 * 60_000;
export type CheckpointTiming = { deadlineAt: string; serverNow: string };

export function useCheckpointRemaining(timing: CheckpointTiming | undefined, running: boolean) {
  const initial = timing ? Math.max(0, Date.parse(timing.deadlineAt) - Date.parse(timing.serverNow)) : null;
  const [remaining, setRemaining] = useState(initial);
  useEffect(() => {
    if (initial === null || !running) return;
    const end = Date.now() + initial;
    const update = () => setRemaining(Math.max(0, end - Date.now()));
    update();
    const timer = setInterval(update, 1000);
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", update);
    return () => { clearInterval(timer); window.removeEventListener("pageshow", update); document.removeEventListener("visibilitychange", update); };
  }, [initial, running]);
  return remaining;
}

export function CheckpointClock({ deadlineAt, remaining, sessionId, originalSubmittedAt: submittedAt }: { deadlineAt: string; remaining: number; sessionId?: string; originalSubmittedAt?: string | null }) {
  // 放在作文工作区的同一列里，作为固定的一行；不额外占一屏高度
  const bar = "flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b bg-sheet px-4 py-2 text-sm";
  if (submittedAt) return <div className={bar} role="status"><span className="font-medium">独立模考已提交，计时结束</span><span className="text-muted-foreground">{Date.parse(submittedAt) <= Date.parse(deadlineAt) ? "按时提交，等待评分不会占用作答时间。" : "超时提交：本次仍会获得反馈，但不会加入成绩趋势。"}</span></div>;
  const seconds = Math.ceil(remaining / 1000);
  return <div className={bar} role="timer"><span className="font-medium">独立模考剩余</span><span className="font-serif text-[20px] leading-none font-medium tabular-nums">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span><span className="text-muted-foreground">离开或暂放不会暂停。到时自动交卷；不足 {MIN_EVALUATION_WORDS} 词不予批改，也不计入练习。</span>{sessionId && remaining > SWAP_UNTIL_REMAINING && <SwapQuestion sessionId={sessionId} />}</div>;
}

/** "这道题我练过，换一道": practised questions do not count as an independent mock, so the learner can say so
 * before writing and get a fresh question with a fresh 40 minutes. */
function SwapQuestion({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const key = useRef<string | null>(null);
  async function swap() {
    setBusy(true); setError("");
    key.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/checkpoints/swap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ attemptId: sessionId, idempotencyKey: key.current }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { key.current = null; throw new Error(typeof data.error === "string" ? data.error : data.error?.message ?? "没有换成，请重试。"); }
      router.replace(`/essays/${data.session.id}`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "连接失败，请重试。"); setBusy(false); }
  }
  return (
    <span className="ml-auto flex items-baseline gap-3">
      {error && <span role="alert" className="text-destructive">{error}</span>}
      <button type="button" disabled={busy} onClick={() => void swap()} className="text-foreground underline underline-offset-4 disabled:opacity-50">{busy ? "正在换题" : "这道题我练过，换一道"}</button>
    </span>
  );
}
