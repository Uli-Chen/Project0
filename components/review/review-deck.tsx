"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ChevronDown, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { presentationKey, type ReviewItem } from "@/lib/learning/review-items";
import { cn } from "@/lib/utils";

/** A due item and how to show it: a flagged sentence past its hinted reviews, and every sound
 * sentence, is shown as "spot the problem" without the problem's name or hint. */
export type DeckCard = { item: ReviewItem; spot: boolean; source: string };
type Outcome = "good" | "again";
type Kind = "fix" | "spot" | "phrase";
const KINDS: [Kind, string][] = [["fix", "改句"], ["spot", "找错"], ["phrase", "表达"]];
const kindOf = (card: DeckCard): Kind => card.item.kind === "phrase" ? "phrase" : card.spot ? "spot" : "fix";

/** Today's reviews as one list: every item is visible, any can be answered in place and in any
 * order, and leaving part-way is fine; what is left is still due next time. */
export function ReviewDeck({ cards }: { cards: DeckCard[] }) {
  // The list is today's as it was when the page opened, so answered items stay, marked done.
  const [list] = useState(cards);
  const [open, setOpen] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [kind, setKind] = useState<Kind | null>(null);
  const done = Object.keys(outcomes).length;
  const shown = kind ? list.filter((card) => kindOf(card) === kind) : list;
  const chip = (active: boolean) => cn("rounded-full px-3 py-1 text-[14px] tabular-nums transition-colors", active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-sunk hover:text-foreground");

  if (!list.length) return <Empty title="今天没有要复习的">采纳过的英文表达、作文里被指出的句子，会在第二天开始出现在这里。</Empty>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <p className="text-[15px] text-muted-foreground">今天 <b className="font-semibold text-foreground tabular-nums">{list.length}</b> 条<span className="mx-2 text-faint">·</span>已完成 <b className="font-semibold text-foreground tabular-nums">{done}</b></p>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunk" aria-hidden><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${(done / list.length) * 100}%` }} /></div>
      </div>
      <div role="group" aria-label="类别" className="flex flex-wrap items-center gap-1">
        <button type="button" aria-pressed={kind === null} onClick={() => setKind(null)} className={chip(kind === null)}>全部 {list.length}</button>
        {KINDS.map(([value, label]) => {
          const count = list.filter((card) => kindOf(card) === value).length;
          return count > 0 && <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)} className={chip(kind === value)}>{label} {count}</button>;
        })}
      </div>
      <ol className="flex flex-col gap-3">
        {shown.map((card) => (
          <ReviewCard key={card.item.id} card={card} open={open === card.item.id} outcome={outcomes[card.item.id] ?? null}
            onToggle={() => setOpen((id) => id === card.item.id ? null : card.item.id)}
            onGraded={(result) => { setOutcomes((all) => ({ ...all, [card.item.id]: result })); setOpen(null); }} />
        ))}
      </ol>
      {done === list.length && <p className="flex items-center justify-center gap-2 pt-2 text-[15px] text-good"><Check className="size-4" />今天的复习做完了</p>}
    </div>
  );
}

function ReviewCard({ card, open, outcome, onToggle, onGraded }: { card: DeckCard; open: boolean; outcome: Outcome | null; onToggle: () => void; onGraded: (result: Outcome) => void }) {
  const router = useRouter();
  const { item, spot } = card;
  const [attempt, setAttempt] = useState("");
  // Spot the problem: what the learner said before seeing the answer.
  const [verdict, setVerdict] = useState<"wrong" | "fine" | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // One key per presentation; a retry after a lost response reuses it, so the grade is recorded once.
  const [presentation] = useState(() => presentationKey());
  const phrase = item.kind === "phrase";
  const flagged = item.kind === "fix";
  const kind = phrase ? "表达" : spot ? "找错" : "改句";
  const writing = !spot || verdict === "wrong";
  const judgedRight = verdict === null ? null : (verdict === "wrong") === flagged;

  async function grade(choice: Outcome) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, result: choice, key: presentation }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "没有保存成功，请重试。");
      // A replayed request reports the grade that was recorded the first time.
      onGraded(data.result === "good" || data.result === "again" ? data.result : choice);
      // The due count in the sidebar and on the tabs comes from the server.
      router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "网络连接失败，请重试。"); }
    finally { setBusy(false); }
  }

  return (
    <li className={cn("surface overflow-hidden transition-shadow", open && "shadow-[0_0_0_1px_var(--faint)]", outcome && "opacity-70")}>
      <button type="button" aria-expanded={open} disabled={outcome !== null} onClick={onToggle} className="flex w-full items-start gap-4 px-5 py-4 text-left disabled:cursor-default">
        <span className={cn("mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[14px]", phrase ? "bg-primary/10 text-primary" : spot ? "bg-warn-soft text-warn" : "bg-sunk text-muted-foreground")}>{kind}</span>
        <span className={cn("min-w-0 flex-1 text-pretty", phrase ? "text-[17px]" : "font-serif text-[17px] leading-[1.55]", !open && "line-clamp-2")}>{item.prompt}</span>
        {outcome
          ? <span className={cn("mt-0.5 flex shrink-0 items-center gap-1 text-[14px]", outcome === "good" ? "text-good" : "text-warn")}>{outcome === "good" ? <><Check className="size-4" />答对了</> : <><RotateCcw className="size-4" />稍后再来</>}</span>
          : <ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />}
      </button>

      {open && !outcome && (
        <div className="border-t px-5 pt-4 pb-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-[15px] text-muted-foreground">{phrase ? "英文怎么说？" : spot ? "这句有没有问题？" : <>改这一句<span className="mx-2 text-faint">·</span><span className="text-foreground">{item.kind === "fix" && item.issueTitle}</span></>}</p>
            <Link href={`/essays/${item.sessionId}`} className="text-[14px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{card.source}</Link>
          </div>
          {item.kind === "fix" && !spot && <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{item.hint}</p>}

          {spot && verdict === null && (
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Button variant="outline" onClick={() => setVerdict("wrong")}>有问题</Button>
              <Button variant="outline" onClick={() => { setVerdict("fine"); setRevealed(true); }}>没问题</Button>
            </div>
          )}

          {writing && !revealed && (
            <>
              <label className="mt-4 block">
                <span className="sr-only">{phrase ? "用英文写出来" : "写下你的改法"}</span>
                <textarea autoFocus value={attempt} onChange={(event) => setAttempt(event.target.value)} rows={2} placeholder={phrase ? "先自己写一遍英文" : "先自己改一遍"} className="w-full rounded-xl border border-input bg-sunk/60 p-3.5 font-serif text-[16px] leading-relaxed transition-colors outline-none placeholder:font-sans placeholder:text-[15px] focus:border-primary/60 focus:bg-sheet" />
              </label>
              <div className="mt-3 flex justify-end"><Button onClick={() => setRevealed(true)}>{attempt.trim() ? "对照" : "看答案"}</Button></div>
            </>
          )}

          {revealed && (
            <div className="motion-reveal mt-4 rounded-xl bg-sunk/60 px-4 py-4">
              {judgedRight !== null && (
                <p className={cn("mb-3 flex items-center gap-2 text-[15px] font-medium", judgedRight ? "text-good" : "text-warn")}>
                  <span className={cn("grid size-5 place-items-center rounded-full", judgedRight ? "bg-good-soft" : "bg-warn-soft")} aria-hidden>{judgedRight ? <Check className="size-3.5" /> : <X className="size-3.5" />}</span>
                  {flagged ? `这句有问题：${item.issueTitle}` : "这句没有问题，是你改对后的版本"}
                </p>
              )}
              {phrase && <Answer label="你采纳过的说法" text={item.answer} note={item.note} />}
              {flagged && (item.answer
                ? <Answer label="你改对过的版本" text={item.answer} />
                : <><p className="text-[14px] text-muted-foreground">尚未改对</p><p className="mt-1.5 text-[15px] leading-relaxed">{spot ? item.hint : "这句还没有核验通过的改法，按上面的方向自己判断。"}</p></>)}
              {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
              <div className="mt-4 flex flex-wrap justify-end gap-2.5">
                <Button variant={judgedRight === false ? "default" : "outline"} disabled={busy} onClick={() => void grade("again")}><RotateCcw />还不稳</Button>
                <Button variant={judgedRight === false ? "outline" : "default"} disabled={busy} onClick={() => void grade("good")}><Check />{phrase ? "记住了" : "答对了"}</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function Answer({ label, text, note }: { label: string; text: string; note?: string }) {
  return (
    <>
      <p className="text-[14px] text-muted-foreground">{label}</p>
      <p className="mt-1.5 font-serif text-[18px] leading-[1.55]">{text}</p>
      {note && <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{note}</p>}
    </>
  );
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="surface flex w-full flex-col items-center px-8 py-16 text-center">
      <h2 className="text-[19px] font-semibold">{title}</h2>
      <p className="mt-2 max-w-[30em] text-[15px] leading-relaxed text-muted-foreground">{children}</p>
      <Link href="/practice" className="mt-6 text-[15px] underline underline-offset-4">去练习</Link>
    </div>
  );
}
