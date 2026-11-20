"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { presentationKey, type ReviewItem } from "@/lib/learning/review-items";
import { cn } from "@/lib/utils";

/** A due item and how to show it: a flagged sentence past its hinted reviews, and every sound
 * sentence, is shown as "spot the problem" without the problem's name or hint. */
export type DeckCard = { item: ReviewItem; spot: boolean; source: string };

/** One card at a time: try first, then compare with your own checked answer and grade yourself. */
export function ReviewDeck({ cards }: { cards: DeckCard[] }) {
  const router = useRouter();
  // `cards` is what the server says is due right now; a round keeps its own cards until it is finished.
  const [round, setRound] = useState(cards);
  const [queue, setQueue] = useState(cards);
  const [cleared, setCleared] = useState<string[]>([]);
  const [done, setDone] = useState(0);
  const [attempt, setAttempt] = useState("");
  // Spot the problem: what the learner said before seeing the answer.
  const [verdict, setVerdict] = useState<"wrong" | "fine" | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // One key per time a card is shown. A retry after a lost response reuses it, so the server
  // records the grade once; the next card (or the same card coming back) gets a fresh key.
  const [presentation, setPresentation] = useState(() => presentationKey());
  const total = round.length;
  const card = queue[0];
  const waiting = cards.filter(next => !cleared.includes(next.item.id));

  async function grade(choice: "good" | "again") {
    if (!card || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: card.item.id, result: choice, key: presentation }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "没有保存成功，请重试。");
      // A replayed request reports the grade that was recorded the first time.
      const result: "good" | "again" = data.result === "good" || data.result === "again" ? data.result : choice;
      // 没答对的排到这一轮最后再来一次
      setQueue(([head, ...rest]) => result === "again" ? [...rest, head] : rest);
      if (result === "good") { setDone(n => n + 1); setCleared(ids => [...ids, card.item.id]); }
      setPresentation(presentationKey());
      setAttempt(""); setVerdict(null); setRevealed(false);
      // The due count in the sidebar and on the tabs comes from the server.
      router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "网络连接失败，请重试。"); }
    finally { setBusy(false); }
  }

  if (!total) return <Empty title="今天没有要复习的">采纳过的英文表达、作文里被指出的句子，会在第二天开始出现在这里。</Empty>;
  if (!card) return (
    <Empty title="今天的复习做完了" done action={waiting.length > 0 && <Button className="mt-6" onClick={() => { setRound(waiting); setQueue(waiting); setDone(0); }}>再复习一轮，还有 {waiting.length} 条</Button>}>
      答对的内容会隔几天再回来，连续答对三次就算掌握。
    </Empty>
  );

  const { item, spot } = card;
  const phrase = item.kind === "phrase";
  const flagged = item.kind === "fix";
  const kind = phrase ? "表达" : spot ? "找错" : "改句";
  // In spot mode the learner first says whether the sentence has a problem; then, if they think so, rewrites it.
  const writing = !spot || verdict === "wrong";
  const judgedRight = verdict === null ? null : (verdict === "wrong") === flagged;

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div className="mb-5 flex items-center gap-4">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunk" aria-hidden><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${(done / total) * 100}%` }} /></div>
        <span className="text-[14px] text-muted-foreground tabular-nums">{done} / {total}</span>
      </div>
      <article key={item.id + presentation} className="surface motion-swap px-6 py-7 sm:px-9 sm:py-8">
        <div className="flex items-center justify-between gap-4">
          <span className={cn("rounded-md px-2 py-0.5 text-[14px]", phrase ? "bg-primary/10 text-primary" : spot ? "bg-warn-soft text-warn" : "bg-sunk text-muted-foreground")}>{kind}</span>
          <Link href={`/essays/${item.sessionId}`} className="text-[14px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{card.source}</Link>
        </div>

        <p className="mt-5 text-[15px] text-muted-foreground">{phrase ? "英文怎么说？" : spot ? "这句有没有问题？" : <>改这一句<span className="mx-2 text-faint">·</span><span className="text-foreground">{item.kind === "fix" && item.issueTitle}</span></>}</p>
        <p className={cn("mt-2 text-pretty", phrase ? "text-[22px] leading-relaxed font-medium" : "font-serif text-[22px] leading-[1.55]")}>{item.prompt}</p>
        {item.kind === "fix" && !spot && <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{item.hint}</p>}

        {spot && verdict === null && (
          <div className="mt-7 flex flex-wrap gap-2.5">
            <Button variant="outline" size="lg" onClick={() => setVerdict("wrong")}>有问题</Button>
            <Button variant="outline" size="lg" onClick={() => { setVerdict("fine"); setRevealed(true); }}>没问题</Button>
          </div>
        )}

        {writing && !revealed && (
          <>
            <label className="mt-6 block">
              <span className="sr-only">{phrase ? "用英文写出来" : "写下你的改法"}</span>
              <textarea value={attempt} onChange={event => setAttempt(event.target.value)} rows={3} placeholder={phrase ? "先自己写一遍英文" : "先自己改一遍"} className="w-full rounded-xl border border-input bg-sunk/60 p-4 font-serif text-[17px] leading-relaxed transition-colors outline-none placeholder:font-sans placeholder:text-[15px] focus:border-primary/60 focus:bg-sheet" />
            </label>
            <div className="mt-4 flex justify-end"><Button size="lg" onClick={() => setRevealed(true)}>{attempt.trim() ? "对照" : "看答案"}</Button></div>
          </>
        )}

        {revealed && (
          <div className="motion-reveal mt-6 border-t pt-6">
            {judgedRight !== null && (
              <p className={cn("mb-4 flex items-center gap-2 text-[15px] font-medium", judgedRight ? "text-good" : "text-warn")}>
                <span className={cn("grid size-5 place-items-center rounded-full", judgedRight ? "bg-good-soft" : "bg-warn-soft")} aria-hidden>{judgedRight ? <Check className="size-3.5" /> : <X className="size-3.5" />}</span>
                {flagged ? `这句有问题：${item.issueTitle}` : "这句没有问题，是你改对后的版本"}
              </p>
            )}
            {phrase && <Answer label="你采纳过的说法" text={item.answer} note={item.note} />}
            {flagged && (item.answer
              ? <Answer label="你改对过的版本" text={item.answer} />
              : <><p className="text-[14px] text-muted-foreground">尚未改对</p><p className="mt-2 text-[15px] leading-relaxed">{spot ? item.hint : "这句还没有核验通过的改法，按上面的方向自己判断。"}</p></>)}
            {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
            <div className="mt-7 flex flex-wrap justify-end gap-2.5">
              <Button variant={judgedRight === false ? "default" : "outline"} disabled={busy} onClick={() => void grade("again")}><RotateCcw />还不稳</Button>
              <Button variant={judgedRight === false ? "outline" : "default"} disabled={busy} onClick={() => void grade("good")}><Check />{phrase ? "记住了" : "答对了"}</Button>
            </div>
          </div>
        )}
      </article>
    </div>
  );
}

function Answer({ label, text, note }: { label: string; text: string; note?: string }) {
  return (
    <>
      <p className="text-[14px] text-muted-foreground">{label}</p>
      <p className="mt-2 font-serif text-[20px] leading-[1.55]">{text}</p>
      {note && <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{note}</p>}
    </>
  );
}

function Empty({ title, done = false, action, children }: { title: string; done?: boolean; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="surface mx-auto flex w-full max-w-[720px] flex-col items-center px-8 py-16 text-center">
      {done && <span className="mb-4 grid size-11 place-items-center rounded-full bg-good-soft text-good"><Check className="size-5" /></span>}
      <h2 className="text-[19px] font-semibold">{title}</h2>
      <p className="mt-2 max-w-[30em] text-[15px] leading-relaxed text-muted-foreground">{children}</p>
      {action}
      <Link href="/practice" className={cn("text-[15px] underline underline-offset-4", action ? "mt-4" : "mt-6")}>去练习</Link>
    </div>
  );
}
