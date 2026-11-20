"use client";

import Link from "next/link";
import { useState } from "react";
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

/** 我的练习 tab: every card, essay and mock, newest first, filtered in place. */
export function PracticeRecords({ rows }: { rows: PracticeRecord[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const visible = rows.filter((row) => matchesEssayFilter(row, filter));
  const count = (value: string) => rows.filter((row) => matchesEssayFilter(row, value)).length;

  return (
    <section aria-label="我的练习" className="mt-8">
      <div className="flex flex-wrap items-end justify-end gap-x-6 gap-y-3">
        <div className="flex gap-1" role="group" aria-label="筛选">
          {FILTERS.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={cn("rounded-full px-3 py-1 text-[14px] tabular-nums transition-colors", filter === value ? "bg-foreground text-background" : "text-muted-foreground hover:bg-sunk hover:text-foreground")}>
              {label} {count(value)}
            </button>
          ))}
        </div>
      </div>
      <ol className="mt-4 border-t border-foreground">
        {visible.map((row) => (
          <li key={row.id} className="border-b">
            <Link href={`/essays/${row.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-5 gap-y-1.5 py-4 transition-colors hover:bg-sunk/60 sm:grid-cols-[5.5rem_minmax(0,1fr)_3.5rem_7.5rem_4.5rem]">
              <span className="text-[14px] text-muted-foreground tabular-nums max-sm:hidden">{row.date}</span>
              <span className="truncate font-serif text-[16px] max-sm:col-span-2">{row.prompt}</span>
              <span className="text-[14px] text-muted-foreground max-sm:hidden">{row.kind}</span>
              <span className="flex items-center gap-2 text-[14px] max-sm:col-start-1 max-sm:row-start-2"><span className={cn("size-1.5 shrink-0 rounded-full", DOT[row.status])} aria-hidden /><span className="truncate">{row.statusLabel}</span><span className="text-muted-foreground sm:hidden">· {row.kind} · {row.date}</span></span>
              <span className="text-right text-[15px] font-medium tabular-nums max-sm:row-start-2">{row.original === null ? "" : row.revision === null ? row.original.toFixed(1) : `${row.original.toFixed(1)} → ${row.revision.toFixed(1)}`}</span>
            </Link>
          </li>
        ))}
      </ol>
      {visible.length === 0 && <p className="py-12 text-center text-[15px] text-muted-foreground">没有{filter === "done" ? "已完成" : "进行中"}的练习</p>}
    </section>
  );
}
