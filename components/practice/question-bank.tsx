"use client";

import Link from "next/link";
import { useState } from "react";
import { ClipboardPaste, SearchX, Shuffle, Sparkles } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyMedia } from "@/components/ui/empty";
import { NewEssayDialog } from "@/components/shell/new-essay";
import { StartPractice } from "@/components/topics/start-practice";
import { cn } from "@/lib/utils";

export type BankQuestion = {
  id: string;
  text: string;
  topic: string;
  tags: string[];
  status: "new" | "open" | "card" | "written";
  statusLabel: string;
  best: string | null;
  openAttemptId: string | null;
};

type Spotlight = { question: BankQuestion; reason: string; random?: boolean };

/** The bank tab: filters beside three ways to get a question, then every matching question as a card. */
/** `questions` is every match (随机一题 draws from all of them); `visible` is the page on screen. */
export function QuestionBank({ filters, coverage, questions, visible, pager, pick, quickEnabled }: { filters: React.ReactNode; coverage?: React.ReactNode; questions: BankQuestion[]; visible: BankQuestion[]; pager: React.ReactNode; pick: Spotlight | null; quickEnabled: boolean }) {
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
  const drawable = questions.filter((q) => q.status !== "open");
  const random = (avoid?: string) => {
    const from = drawable.length > 1 ? drawable.filter((q) => q.id !== avoid) : drawable;
    if (from.length) setSpotlight({ question: from[Math.floor(Math.random() * from.length)], reason: "从当前筛选里随机抽的一道", random: true });
  };

  return (
    <>
      <div className="motion-enter mt-5 flex flex-wrap items-start justify-between gap-x-8 gap-y-4" style={{ "--i": 2 } as React.CSSProperties}>
        <div className="min-w-0">{filters}</div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" title="按你的练习情况挑一道" className="bg-coach-soft text-primary shadow-[0_0_0_1px_var(--coach-line)] hover:bg-coach-soft hover:shadow-[0_0_0_1px_var(--primary)]" disabled={!pick} onClick={() => pick && setSpotlight(pick)}><Sparkles />推荐一题</Button>
          <Button variant="outline" size="sm" title="从当前筛选里抽一道" disabled={!drawable.length} onClick={() => random()}><Shuffle className="text-primary" />随机一题</Button>
          <NewEssayDialog pasteOnly trigger={<Button variant="outline" size="sm" title="粘贴任意一道大作文题"><ClipboardPaste className="text-primary" />用自己的题</Button>} />
        </div>
      </div>

      {coverage}

      {visible.length > 0 ? (
        // Keyed by the visible ids so a new filter or page quietly replays the stagger.
        <ol key={visible.map((q) => q.id).join("|")} aria-label="题目" className="motion-stagger mt-6 grid gap-3.5 lg:grid-cols-2">
          {visible.map((q) => (
            <li key={q.id} className="surface motion-press flex flex-col gap-4 p-5 transition-shadow duration-(--dur-standard) ease-(--ease-soft) hover:shadow-[0_0_0_1px_var(--coach-line),0_14px_28px_-14px_color-mix(in_srgb,var(--coach)_35%,transparent)] focus-within:shadow-[0_0_0_1px_var(--coach-line),0_14px_28px_-14px_color-mix(in_srgb,var(--coach)_35%,transparent)]">
              <p className="line-clamp-4 font-serif text-[17px] leading-[1.55] text-pretty">{q.text}</p>
              <div className="mt-auto flex flex-wrap items-end justify-between gap-3 sm:flex-nowrap">
                <Tags question={q} />
                <div className="flex shrink-0 gap-2"><Actions question={q} quickEnabled={quickEnabled} /></div>
              </div>
            </li>
          ))}
        </ol>
      ) : <Empty className="mt-6"><EmptyMedia variant="icon"><SearchX /></EmptyMedia><EmptyDescription>没有符合筛选的题目</EmptyDescription></Empty>}
      {pager}

      <Dialog open={spotlight !== null} onOpenChange={(open) => { if (!open) setSpotlight(null); }}>
        <DialogContent className="gap-0 p-7 sm:max-w-xl">
          {spotlight && (
            <>
              {/* Keyed cross-fade so 换一道 reads as a fresh draw. */}
              <div key={spotlight.question.id} className="motion-swap">
                <p className="flex items-center gap-2 pr-8 text-[15px] text-muted-foreground"><span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />{spotlight.reason}</p>
                <DialogTitle className="mt-4 font-serif text-[23px] leading-[1.4] font-medium text-pretty">{spotlight.question.text}</DialogTitle>
                <div className="mt-5"><Tags question={spotlight.question} /></div>
              </div>
              <div className="mt-7 flex flex-wrap items-center gap-2">
                <Actions question={spotlight.question} quickEnabled={quickEnabled} size="lg" />
                {spotlight.random && drawable.length > 1 && <button type="button" onClick={() => random(spotlight.question.id)} className="inline-flex h-11 items-center rounded-full px-4 text-[15px] text-muted-foreground transition-colors hover:bg-sunk hover:text-foreground">换一道</button>}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

const STATUS_TONE: Record<BankQuestion["status"], string> = {
  new: "text-faint",
  open: "text-warn",
  card: "text-primary",
  written: "text-good",
};

/** The topic on its own hue, the type as quiet text, and the practice status with a dot once there is something to show. */
function Tags({ question }: { question: BankQuestion }) {
  const [topic, ...rest] = question.tags;
  return (
    <ul className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px] text-muted-foreground" aria-label="标签">
      <li className="topic-tag" data-topic={question.topic}>{topic}</li>
      {rest.map((tag) => <li key={tag}>{tag}</li>)}
      <li className={cn("flex items-center gap-2 whitespace-nowrap", question.status !== "new" && "font-medium before:size-1.5 before:rounded-full before:bg-current before:content-['']", STATUS_TONE[question.status])}>
        {question.statusLabel}
        {question.best && <span className="rounded-md bg-good-soft px-1.5 text-[13px] tabular-nums"><span className="sr-only">最高 </span>{question.best}</span>}
      </li>
    </ul>
  );
}

function Actions({ question, quickEnabled, size }: { question: BankQuestion; quickEnabled: boolean; size?: "lg" }) {
  if (question.openAttemptId) return <Link href={`/essays/${question.openAttemptId}`} className={buttonVariants({ size: size ?? "sm" })}>继续</Link>;
  return (
    <>
      {quickEnabled && <StartPractice size={size ?? "sm"} variant={size === "lg" ? "default" : "outline"} questionId={question.id} activity="quick">卡片</StartPractice>}
      <StartPractice size={size ?? "sm"} variant={size === "lg" && !quickEnabled ? "default" : "outline"} questionId={question.id} activity="deep">作文</StartPractice>
    </>
  );
}
