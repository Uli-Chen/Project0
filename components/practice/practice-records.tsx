"use client";

import Link from "next/link";
import { useState } from "react";
import { ListFilter } from "lucide-react";
import { Empty, EmptyDescription, EmptyMedia } from "@/components/ui/empty";
import { matchesEssayFilter } from "@/lib/learning/library";
import type { EssayStatus } from "@/lib/learning/summary";
import { cn } from "@/lib/utils";

export type PracticeRecord = {
  id: string;
  prompt: string;
  kind: string;
  status: EssayStatus;
  statusLabel: string;
  completed: boolean;
  lifecycle: string;
  original: number | null;
  revision: number | null;
  date: string;
};

const DOT: Record<EssayStatus, string> = {
  drafting: "bg-muted-foreground/50",
  evaluating: "bg-coach animate-pulse",
  evaluated: "bg-foreground",
  revising: "bg-warn",
  done: "bg-good",
};
const FILTERS = [["all", "全部"], ["active", "进行中"], ["done", "已完成"]] as const;
const STEP = 20;

/** 我的练习 tab: every card, essay and mock, newest first, filtered in place. */
export function PracticeRecords({ rows }: { rows: PracticeRecord[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  // The list grows with every practice; show a screenful and let the learner ask for more.
  const [shown, setShown] = useState(STEP);
  const matching = rows.filter((row) => matchesEssayFilter(row, filter));
  const visible = matching.slice(0, shown);
  const count = (value: string) => rows.filter((row) => matchesEssayFilter(row, value)).length;

  return (
    <section aria-label="我的练习" className="mt-6">
      <div className="flex flex-wrap items-end justify-end gap-x-6 gap-y-3">
        <div className="flex gap-1" role="group" aria-label="筛选">
          {FILTERS.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setShown(STEP); }} className="chip tabular-nums">
              {label} {count(value)}
            </button>
          ))}
        </div>
      </div>
      <ol key={filter} className="motion-stagger mt-3 border-t">
        {visible.map((row) => (
          <li key={row.id} className="border-b">
            <Link href={`/essays/${row.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-5 gap-y-1.5 py-3.5 transition-colors duration-(--dur-fast) hover:bg-sunk sm:grid-cols-[5.5rem_minmax(0,1fr)_3.5rem_7.5rem_4.5rem]">
              <span className="text-[14px] text-muted-foreground tabular-nums max-sm:hidden">{row.date}</span>
              <span className="truncate font-serif text-[16px] max-sm:col-span-2">{row.prompt}</span>
              <span className="text-[14px] text-muted-foreground max-sm:hidden">{row.kind}</span>
              <span className="flex items-center gap-2 text-[14px] max-sm:col-start-1 max-sm:row-start-2"><span className={cn("size-1.5 shrink-0 rounded-full", DOT[row.status])} aria-hidden /><span className="flex min-w-0 items-baseline gap-2">{row.statusLabel.split(" · ").map((part, i) => <span key={part} className={cn("truncate", i > 0 && "text-muted-foreground")}>{part}</span>)}</span><span className="ml-1 flex gap-2.5 text-muted-foreground sm:hidden"><span>{row.kind}</span><span className="tabular-nums">{row.date}</span></span></span>
              <span className="text-right text-[15px] font-medium tabular-nums max-sm:row-start-2">{row.original === null ? "" : row.revision === null ? row.original.toFixed(1) : `${row.original.toFixed(1)} → ${row.revision.toFixed(1)}`}</span>
            </Link>
          </li>
        ))}
      </ol>
      {matching.length > visible.length && <button type="button" onClick={() => setShown((n) => n + STEP)} className="mt-3 -ml-3 inline-flex h-8 items-center rounded-full px-3 text-[14px] text-muted-foreground transition-colors duration-(--dur-fast) hover:bg-sunk hover:text-foreground">显示更多<span className="ml-1.5 text-faint tabular-nums">还有 {matching.length - visible.length} 条</span></button>}
      {visible.length === 0 && <Empty><EmptyMedia variant="icon"><ListFilter /></EmptyMedia><EmptyDescription>没有{filter === "done" ? "已完成" : "进行中"}的练习</EmptyDescription></Empty>}
    </section>
  );
}
