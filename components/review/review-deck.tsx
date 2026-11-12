"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReviewItem } from "@/lib/learning/review-items";
import { cn } from "@/lib/utils";

/** One card at a time: try first, then compare with your own earlier answer and grade yourself. */
export function ReviewDeck({ items }: { items: ReviewItem[] }) {
  const router = useRouter();
  // `items` is what the server says is due right now; a round keeps its own cards until it is finished.
  const [round, setRound] = useState(items);
  const [queue, setQueue] = useState(items);
  const [cleared, setCleared] = useState<string[]>([]);
  const [done, setDone] = useState(0);
  const [attempt, setAttempt] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // One key per time a card is shown. A retry after a lost response reuses it, so the server
  // records the grade once; the next card (or the same card coming back) gets a fresh key.
  const [presentation, setPresentation] = useState(() => crypto.randomUUID());
  const total = round.length;
  const item = queue[0];
  const waiting = items.filter(next => !cleared.includes(next.id));

  async function grade(choice: "good" | "again") {
    if (!item || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, result: choice, key: presentation }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "没有保存成功，请重试。");
      // A replayed request reports the grade that was recorded the first time.
      const result: "good" | "again" = data.result === "good" || data.result === "again" ? data.result : choice;
      // 没记住的排到这一轮最后再来一次
      setQueue(([head, ...rest]) => result === "again" ? [...rest, head] : rest);
      if (result === "good") { setDone(n => n + 1); setCleared(ids => [...ids, item.id]); }
      setPresentation(crypto.randomUUID());
      setAttempt(""); setRevealed(false);
      // The due count in the sidebar and on the tabs comes from the server.
      router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "网络连接失败，请重试。"); }
    finally { setBusy(false); }
  }

  if (!total) return <Empty title="现在没有要复习的内容">在精练里采纳“英文怎么说”的表达，或者拿到一次写作反馈之后，你自己的表达和被指出的句子会出现在这里。</Empty>;
  if (!item) return (
    <Empty title="这一轮复习做完了" done action={waiting.length > 0 && <Button className="mt-6" onClick={() => { setRound(waiting); setQueue(waiting); setDone(0); }}>继续复习，还有 {waiting.length} 条</Button>}>
      记住的内容会隔几天再回来，间隔会越来越长。
    </Empty>
  );

  const phrase = item.kind === "phrase";
  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div className="mb-4 flex items-center gap-4">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary" aria-hidden><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${(done / total) * 100}%` }} /></div>
        <span className="text-sm text-muted-foreground tabular-nums">{done} / {total}</span>
      </div>
      <article key={item.id} className="paper motion-swap px-6 py-7 sm:px-10 sm:py-9">
        <p className="text-sm font-medium text-muted-foreground">{phrase ? "这句话，英文怎么说？" : `改这一句：${item.issueTitle}`}</p>
        <p className={cn("mt-3 text-pretty", phrase ? "text-[21px] leading-relaxed font-medium" : "font-serif text-[21px] leading-[1.55]")}>{item.prompt}</p>
        {!phrase && <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{item.hint}</p>}
        <label className="mt-6 block">
          <span className="sr-only">{phrase ? "用英文写出来" : "写下你的改法"}</span>
          <textarea value={attempt} disabled={revealed} onChange={event => setAttempt(event.target.value)} rows={3} placeholder={phrase ? "先自己写一遍英文，再看答案" : "先自己改一遍，再对照"} className="w-full rounded-lg border border-input bg-sunk p-3.5 font-serif text-[17px] leading-relaxed transition-colors outline-none placeholder:font-sans placeholder:text-[15px] placeholder:text-faint focus:border-primary/60 focus:bg-sheet disabled:opacity-80" />
        </label>
        {!revealed ? (
          <div className="mt-4 flex justify-end"><Button onClick={() => setRevealed(true)}>{attempt.trim() ? "对照" : "直接看答案"}</Button></div>
        ) : (
          <div className="motion-reveal mt-5 border-t pt-5">
            {item.answer ? (
              <>
                <p className="text-sm font-medium text-muted-foreground">{phrase ? "你采纳过的说法" : "你当时的改法"}</p>
                <p className="mt-2 font-serif text-[19px] leading-[1.6]">{item.answer}</p>
                {phrase && item.note && <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{item.note}</p>}
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-muted-foreground">尚未改写</p>
                <p className="mt-2 text-[15px] leading-relaxed">{item.kind === "fix" && item.revised ? "改写稿里这一句还没有改过，" : "这篇还没有改写稿，"}没有你自己的改法可以对照。按上面的方向判断改得对不对。</p>
              </>
            )}
            {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
            <div className="mt-6 flex flex-wrap justify-end gap-2.5">
              <Button variant="outline" disabled={busy} onClick={() => void grade("again")}><RotateCcw />还不稳，再来一次</Button>
              <Button disabled={busy} onClick={() => void grade("good")}><Check />{phrase ? "记住了" : "改对了"}</Button>
            </div>
          </div>
        )}
      </article>
      <p className="mt-4 text-center text-sm text-muted-foreground"><Link href={`/essays/${item.sessionId}`} className="underline underline-offset-4 hover:text-foreground">查看这句话出自哪篇作文</Link></p>
    </div>
  );
}

function Empty({ title, done = false, action, children }: { title: string; done?: boolean; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col items-center rounded-2xl border border-dashed border-input px-8 py-16 text-center">
      {done && <span className="mb-4 grid size-11 place-items-center rounded-full bg-good-soft text-good"><Check className="size-5" /></span>}
      <h2 className="text-[19px] font-semibold">{title}</h2>
      <p className="mt-2 max-w-[30em] text-[15px] leading-relaxed text-muted-foreground">{children}</p>
      {action}
      <Link href="/" className={cn("text-sm underline underline-offset-4", action ? "mt-4" : "mt-6")}>去练习</Link>
    </div>
  );
}
