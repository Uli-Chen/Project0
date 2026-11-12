"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, RotateCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useStartEssay } from "@/components/shell/new-essay";

type Status = { enabled: boolean; state: string; candidateQuestionId?: string; candidateText?: string; attemptId?: string };
/** loading → closed (feature off) | ready; a failed fetch is shown as such, never as "no invitation". */
type Load = { phase: "loading" } | { phase: "failed" } | { phase: "ready"; status: Status };

async function loadStatus(): Promise<Load> {
  try {
    const response = await fetch("/api/checkpoints");
    const data = await response.json();
    if (!response.ok || typeof data?.enabled !== "boolean") return { phase: "failed" };
    return { phase: "ready", status: data as Status };
  } catch { return { phase: "failed" }; }
}

export function CheckpointInvitation({ fallback = null }: { fallback?: React.ReactNode } = {}) {
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  const [declaration, setDeclaration] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const startKey = useRef<{ signature: string; key: string } | null>(null);
  const router = useRouter();
  const mock = useStartEssay();

  const refresh = async () => setLoad(await loadStatus());
  useEffect(() => {
    let live = true;
    void loadStatus().then(next => { if (live) setLoad(next); });
    return () => { live = false; };
  }, []);

  async function act(skip = false) {
    if (load.phase !== "ready") return;
    setBusy(true); setError("");
    // Retrying the same start reuses its key, so a lost response cannot open a second attempt.
    const signature = JSON.stringify([load.status.candidateQuestionId, declaration]);
    if (startKey.current?.signature !== signature) startKey.current = { signature, key: crypto.randomUUID() };
    try {
      const response = await fetch(`/api/checkpoints/${skip ? "skip" : "start"}`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(skip ? {} : { questionId: load.status.candidateQuestionId, declaration, idempotencyKey: startKey.current.key }) });
      const data = await response.json();
      if (!response.ok) {
        startKey.current = null;
        setError((typeof data.error === "string" ? data.error : data.error?.message) ?? data.message ?? "现在不能开始，请稍后再试。");
        setDeclaration("");
        await refresh();
        return;
      }
      if (data.session) router.push(`/essays/${data.session.id}`); else await refresh();
    } catch { setError("连接失败，请重试。"); }
    finally { setBusy(false); }
  }

  if (load.phase === "loading") return null;
  if (load.phase === "failed") return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sunk px-6 py-4">
      <p role="status" className="text-[15px]">模考信息暂时无法加载</p>
      <Button size="sm" variant="outline" onClick={() => { setLoad({ phase: "loading" }); void refresh(); }}><RotateCw />重试</Button>
    </section>
  );
  const status = load.status;
  if (!status.enabled) return null;
  if (status.state === "not_due" || status.state === "deferred") return <>{fallback}</>;
  const failure = error || mock.error;
  return (
    <section className="flex flex-wrap items-start gap-4 rounded-2xl bg-sunk px-6 py-5">
      <span className="grid size-9 shrink-0 place-items-center rounded-full border bg-sheet text-muted-foreground" aria-hidden><Clock className="size-4.5" /></span>
      <div className="min-w-0 flex-1">
        <h2 className="font-medium">独立模考</h2>
        <p className="mt-0.5 text-[15px] text-muted-foreground">40 分钟，不用教练，用一道你没练过的题。成绩单独记录，看你不靠帮助时写到什么水平。</p>
        {status.state === "in_progress" ? (
          <Link href={`/essays/${status.attemptId}`} className={buttonVariants({ variant: "outline", size: "sm", className: "mt-3" })}>继续独立模考</Link>
        ) : status.state === "unavailable" ? (
          <div className="mt-3 flex flex-col items-start gap-3">
            <p className="text-[15px]">现在没有你没练过的题可用。可以先做一次普通模考：同样 40 分钟、会有反馈，但成绩不进入独立模考的变化。</p>
            <Button size="sm" variant="outline" disabled={mock.busy} onClick={() => void mock.start({ kind: "free", mode: "mock" })}>开始普通模考</Button>
          </div>
        ) : (
          <div className="mt-4 border-l-2 pl-4">
            <p className="font-serif text-[16px] leading-relaxed">{status.candidateText}</p>
            <label className="mt-3 flex flex-wrap items-center gap-2 text-[15px]">
              你在别处练过这道题吗？
              <select className="h-8 rounded-md border border-input bg-sheet px-2 text-[15px]" value={declaration} onChange={e => setDeclaration(e.target.value)}>
                <option value="">请选择</option><option value="no">没有</option><option value="yes">练过</option><option value="unsure">不确定</option>
              </select>
            </label>
            <div className="mt-3 flex gap-2.5">
              <Button size="sm" variant="outline" disabled={busy || !declaration} onClick={() => void act()}>开始独立模考</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(true)}>七天后提醒</Button>
            </div>
          </div>
        )}
        {failure && <p role="alert" className="mt-2 text-[15px] text-destructive">{failure}</p>}
      </div>
    </section>
  );
}
