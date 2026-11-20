"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Swapping the question is offered only in the first five minutes of the 40 (the server also requires an empty draft).
const SWAP_UNTIL_REMAINING = 35 * 60_000;
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
  // 放在作文工作区的同一列里，作为固定的一行；不额外占一屏高度
  const bar = "flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b bg-sheet px-4 py-2 text-sm";
  if (submittedAt) return <div className={bar} role="status"><span className="font-medium">独立模考已提交，计时结束</span><span className="text-muted-foreground">{Date.parse(submittedAt) <= Date.parse(deadlineAt) ? "按时提交，等待评分不会占用作答时间。" : "超时提交：本次仍会获得反馈，但不会加入成绩趋势。"}</span></div>;
  return <div className={bar} role="timer"><span className="font-medium">独立模考剩余</span><span className="font-serif text-[20px] leading-none font-medium tabular-nums">{Math.floor(remaining / 60000)}:{String(Math.floor(remaining / 1000) % 60).padStart(2, "0")}</span><span className="text-muted-foreground">刷新、离开或暂放都不会暂停；超时仍可提交并获得反馈，但不会加入成绩趋势。</span>{sessionId && remaining > SWAP_UNTIL_REMAINING && <SwapQuestion sessionId={sessionId} />}</div>;
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
