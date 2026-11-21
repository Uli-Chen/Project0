"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useStartEssay } from "@/components/shell/new-essay";

const solid = buttonVariants({ size: "lg" });

/** One button into the exam. The server picks the question; a practised one can be swapped on the exam page. */
export function StartMock({ state, attemptId }: { state: "available" | "deferred" | "in_progress" | "unavailable"; attemptId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const key = useRef<string | null>(null);
  const free = useStartEssay();

  async function start() {
    setBusy(true); setError("");
    key.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/checkpoints/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idempotencyKey: key.current }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { key.current = null; throw new Error(typeof data.error === "string" ? data.error : data.error?.message ?? "现在不能开始，请稍后再试。"); }
      router.push(`/essays/${data.session.id}`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "连接失败，请重试。"); setBusy(false); }
  }

  if (state === "in_progress" && attemptId) return <Link href={`/essays/${attemptId}`} className={solid}>继续模考</Link>;
  if (state === "unavailable") return (
    <div className="flex flex-col items-start gap-2.5">
      <button type="button" disabled={free.busy} aria-busy={free.busy} onClick={() => void free.start({ kind: "free", mode: "mock" })} className={solid}>{free.busy && <LoaderCircle className="size-4 animate-spin" />}开始普通模考<span className="font-normal opacity-65">40 分钟</span></button>
      <p className="text-[15px] text-muted-foreground">题库里你没练过的题都用完了，普通模考有反馈，但不计入成绩趋势。</p>
      {free.error && <p role="alert" className="motion-reveal text-[15px] text-destructive">{free.error}</p>}
    </div>
  );
  return (
    <div className="flex flex-col items-start gap-2.5">
      <button type="button" disabled={busy} aria-busy={busy} onClick={() => void start()} className={solid}>{busy && <LoaderCircle className="size-4 animate-spin" />}开始模考<span className="font-normal opacity-65">40 分钟</span></button>
      {error && <p role="alert" className="motion-reveal text-[15px] text-destructive">{error}</p>}
    </div>
  );
}
