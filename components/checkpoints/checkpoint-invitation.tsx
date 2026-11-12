"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
    <section className="rounded-2xl bg-sunk px-6 py-5">
      <CheckpointTitle />
      {status.state === "in_progress" ? (
        <Link href={`/essays/${status.attemptId}`} className={buttonVariants({ variant: "outline", size: "sm", className: "mt-3" })}>继续独立模考</Link>
      ) : status.state === "unavailable" ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
          <p className="text-[15px]">暂时没有你没练过的题</p>
          <Button size="sm" variant="outline" disabled={mock.busy} onClick={() => void mock.start({ kind: "free", mode: "mock" })}>改做普通模考</Button>
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
    </section>
  );
}

/** "独立模考 · 40 分钟" with its rules one click away, so nothing explains the feature permanently. */
export function CheckpointTitle() {
  return (
    <div className="flex items-center gap-1.5">
      <h2 className="font-medium">独立模考 · 40 分钟</h2>
      <Popover>
        <PopoverTrigger render={<Button size="sm" variant="ghost" className="h-7 px-2.5 text-[14px]" />}>规则</PopoverTrigger>
        <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-4">
          <ul className="flex flex-col gap-2 text-[14px] leading-relaxed text-foreground">
            {CHECKPOINT_RULES.map(rule => <li key={rule}>{rule}</li>)}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}

const CHECKPOINT_RULES = [
  "40 分钟写一道你没练过的题，不用教练。成绩单独记录，看你不靠帮助时写到什么水平。",
  "完成第一篇精练后开放，两次之间至少隔两周。",
  "在别处练过这道题、超过 40 分钟提交或写作时用了教练，这次成绩不计入独立模考。",
  "没有可用的题时，可以改做普通模考：同样 40 分钟，有反馈，成绩不计入独立模考。",
];
