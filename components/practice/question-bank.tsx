"use client";

import Link from "next/link";
import { useState } from "react";
import { ClipboardPaste, Shuffle, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { NewEssayDialog } from "@/components/shell/new-essay";
import { StartPractice } from "@/components/topics/start-practice";
import { cn } from "@/lib/utils";

export type BankQuestion = {
  id: string;
  text: string;
  tags: string[];
  status: "new" | "open" | "card" | "written";
  statusLabel: string;
  openAttemptId: string | null;
};

type Spotlight = { question: BankQuestion; reason: string; random?: boolean };

/** The bank tab: filters beside three ways to get a question, then every matching question as a card. */
export function QuestionBank({ filters, questions, pick, quickEnabled }: { filters: React.ReactNode; questions: BankQuestion[]; pick: Spotlight | null; quickEnabled: boolean }) {
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
  const drawable = questions.filter((q) => q.status !== "open");
  const random = (avoid?: string) => {
    const from = drawable.length > 1 ? drawable.filter((q) => q.id !== avoid) : drawable;
    if (from.length) setSpotlight({ question: from[Math.floor(Math.random() * from.length)], reason: "从当前筛选里随机抽的一道", random: true });
  };

  return (
    <>
      <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="surface px-5 py-4">{filters}</div>
        <div className="surface flex flex-col p-2">
          <ActionButton icon={<Sparkles />} title="推荐一题" detail="按你的练习情况挑一道" disabled={!pick} onClick={() => pick && setSpotlight(pick)} />
          <ActionButton icon={<Shuffle />} title="随机一题" detail="从当前筛选里抽一道" disabled={!drawable.length} onClick={() => random()} />
          <NewEssayDialog pasteOnly trigger={<button type="button" className={actionClass}><ActionBody icon={<ClipboardPaste />} title="用自己的题" detail="粘贴任意一道大作文题" /></button>} />
        </div>
      </div>

      {questions.length > 0 ? (
        <ol aria-label="题目" className="mt-6 grid gap-4 lg:grid-cols-2">
          {questions.map((q) => (
            <li key={q.id} className="surface flex flex-col gap-4 p-5 transition-shadow hover:shadow-[0_0_0_1px_var(--faint)]">
              <p className="line-clamp-4 font-serif text-[17px] leading-[1.55]">{q.text}</p>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
                <Tags question={q} />
                <div className="flex gap-2"><Actions question={q} quickEnabled={quickEnabled} /></div>
              </div>
            </li>
          ))}
        </ol>
      ) : <p className="py-16 text-center text-[15px] text-muted-foreground">没有符合筛选的题目</p>}

      <Dialog open={spotlight !== null} onOpenChange={(open) => { if (!open) setSpotlight(null); }}>
        <DialogContent className="gap-0 p-7 sm:max-w-xl">
          {spotlight && (
            <>
              <p className="flex items-center gap-2 pr-8 text-[15px] text-muted-foreground"><span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />{spotlight.reason}</p>
              <DialogTitle className="mt-4 font-serif text-[23px] leading-[1.4] font-medium text-pretty">{spotlight.question.text}</DialogTitle>
              <div className="mt-5"><Tags question={spotlight.question} /></div>
              <div className="mt-7 flex flex-wrap items-center gap-2">
                <Actions question={spotlight.question} quickEnabled={quickEnabled} size="lg" />
                {spotlight.random && drawable.length > 1 && <button type="button" onClick={() => random(spotlight.question.id)} className="inline-flex h-12 items-center rounded-full px-5 text-base text-muted-foreground transition-colors hover:bg-sunk hover:text-foreground">换一道</button>}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

const actionClass = "flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-sunk disabled:pointer-events-none disabled:opacity-50";

function ActionButton({ icon, title, detail, disabled, onClick }: { icon: React.ReactNode; title: string; detail: string; disabled?: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={actionClass}><ActionBody icon={icon} title={title} detail={detail} /></button>;
}

function ActionBody({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <>
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-sunk text-foreground [&_svg]:size-4" aria-hidden>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[15px] font-medium">{title}</span>
        <span className="block text-[14px] text-muted-foreground">{detail}</span>
      </span>
    </>
  );
}

const STATUS_TONE: Record<BankQuestion["status"], string> = {
  new: "bg-sunk text-muted-foreground",
  open: "bg-warn-soft text-warn",
  card: "bg-primary/10 text-primary",
  written: "bg-good-soft text-good",
};

function Tags({ question }: { question: BankQuestion }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="标签">
      {question.tags.map((tag) => <li key={tag} className="rounded-md bg-sunk px-2 py-0.5 text-[14px] text-muted-foreground">{tag}</li>)}
      <li className={cn("rounded-md px-2 py-0.5 text-[14px]", STATUS_TONE[question.status])}>{question.statusLabel}</li>
    </ul>
  );
}

function Actions({ question, quickEnabled, size }: { question: BankQuestion; quickEnabled: boolean; size?: "lg" }) {
  if (question.openAttemptId) return <Link href={`/essays/${question.openAttemptId}`} className={cn("inline-flex items-center rounded-full bg-foreground font-medium text-background transition-colors hover:bg-foreground/85", size === "lg" ? "h-12 px-7 text-base" : "h-9 px-4 text-[15px]")}>继续</Link>;
  return (
    <>
      {quickEnabled && <StartPractice size={size ?? "sm"} variant={size === "lg" ? "default" : "outline"} questionId={question.id} activity="quick">卡片</StartPractice>}
      <StartPractice size={size ?? "sm"} variant={size === "lg" && !quickEnabled ? "default" : "outline"} questionId={question.id} activity="deep">作文</StartPractice>
    </>
  );
}
