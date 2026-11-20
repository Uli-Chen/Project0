"use client";

import Link from "next/link";
import { useState } from "react";
import { NewEssayDialog } from "@/components/shell/new-essay";
import { StartPractice } from "@/components/topics/start-practice";
import { cn } from "@/lib/utils";

export type BankQuestion = {
  id: string;
  text: string;
  meta: string[];
  status: "new" | "open" | "card" | "written";
  statusLabel: string;
  openAttemptId: string | null;
};

type Spotlight = { question: BankQuestion; reason: string };
const ghost = "inline-flex h-9 items-center rounded-full px-4 text-[15px] text-muted-foreground transition-colors hover:bg-sunk hover:text-foreground";

/** The bank tab: 推荐一题 / 随机一题 put one question in focus above the filters; every question can start a card or an essay. */
export function QuestionBank({ tabs, filters, questions, pick, quickEnabled }: { tabs: React.ReactNode; filters: React.ReactNode; questions: BankQuestion[]; pick: Spotlight | null; quickEnabled: boolean }) {
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
  const random = () => {
    const fresh = questions.filter((q) => q.status === "new");
    const from = fresh.length ? fresh : questions.filter((q) => q.status !== "open");
    if (!from.length) return;
    setSpotlight({ question: from[Math.floor(Math.random() * from.length)], reason: fresh.length ? "随机抽的一道你没练过的题" : "随机抽的一道题" });
  };

  return (
    <>
      <div className="mt-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b">
        {tabs}
        <div className="-mr-2 flex flex-wrap items-center pb-2">
          {pick && <button type="button" onClick={() => setSpotlight(pick)} className={ghost}>推荐一题</button>}
          <button type="button" onClick={random} className={ghost}>随机一题</button>
          <NewEssayDialog pasteOnly trigger={<button type="button" className={ghost}>用自己的题</button>} />
        </div>
      </div>

      {spotlight && (
        <section aria-label="选中的题目" className="mt-10">
          <p className="flex items-center gap-2 text-[15px] text-muted-foreground"><span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />{spotlight.reason}</p>
          <p className="mt-3 max-w-[34em] font-serif text-[24px] leading-[1.35] font-medium text-pretty sm:text-[28px]">{spotlight.question.text}</p>
          <p className="mt-4 text-[15px] text-muted-foreground">{spotlight.question.meta.join(" · ")}</p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Actions question={spotlight.question} quickEnabled={quickEnabled} size="lg" />
            <button type="button" onClick={() => setSpotlight(null)} className={cn(ghost, "h-12 px-5 text-base")}>收起</button>
          </div>
        </section>
      )}

      <div className="mt-10">{filters}</div>

      <ol aria-label="题目" className="mt-6 border-t border-foreground">
        {questions.map((q) => (
          <li key={q.id} className="grid gap-x-8 gap-y-3 border-b py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="min-w-0">
              <p className="line-clamp-2 max-w-[44em] font-serif text-[17px] leading-[1.55]">{q.text}</p>
              <p className="mt-1.5 text-[14px] text-muted-foreground">{q.meta.join(" · ")}<span className="mx-2 text-faint">·</span><span className={cn(q.status === "new" ? "" : "text-foreground")}>{q.statusLabel}</span></p>
            </div>
            <div className="flex gap-2"><Actions question={q} quickEnabled={quickEnabled} /></div>
          </li>
        ))}
      </ol>
      {questions.length === 0 && <p className="py-16 text-center text-[15px] text-muted-foreground">没有符合筛选的题目</p>}
    </>
  );
}

function Actions({ question, quickEnabled, size }: { question: BankQuestion; quickEnabled: boolean; size?: "lg" }) {
  if (question.openAttemptId) return <Link href={`/essays/${question.openAttemptId}`} className={cn("inline-flex items-center rounded-full bg-foreground font-medium text-background transition-colors hover:bg-foreground/85", size === "lg" ? "h-12 px-7 text-base" : "h-9 px-4 text-[15px]")}>继续</Link>;
  const variant = size === "lg" ? "default" : "outline";
  return (
    <>
      {quickEnabled && <StartPractice size={size ?? "sm"} variant={variant} questionId={question.id} activity="quick">卡片</StartPractice>}
      <StartPractice size={size ?? "sm"} variant={size === "lg" && quickEnabled ? "outline" : variant} questionId={question.id} activity="deep">作文</StartPractice>
    </>
  );
}
