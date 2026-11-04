"use client";

import { Lightbulb, MessageSquare } from "lucide-react";
import { ISSUE_SOLID } from "@/components/essay/essay-reader";
import { Button } from "@/components/ui/button";
import type { Issue } from "@/lib/prototype/types";
import { cn } from "@/lib/utils";

export function IssueBadge({ rank, className }: { rank: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-[#1a1d23] tabular-nums", className)}
      style={{ background: ISSUE_SOLID[(rank - 1) % 3] }}
    >
      {rank}
    </span>
  );
}

export function SentenceRefs({ ids, onJump }: { ids: number[]; onJump: (id: number) => void }) {
  if (!ids.length) return null;
  return (
    <span className="meta">
      第{" "}
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && "、"}
          <button type="button" onClick={(event) => { event.stopPropagation(); onJump(id); }} className="text-foreground underline decoration-dotted underline-offset-3 hover:text-primary">
            {id}
          </button>
        </span>
      ))}{" "}
      句
    </span>
  );
}

/** 按影响排序的问题；悬停或选中时正文对应句子加深 */
export function IssueList({
  issues,
  activeRank,
  onSelect,
  onHover,
  onJump,
  onDiscuss,
}: {
  issues: Issue[];
  activeRank: number | null;
  onSelect: (rank: number) => void;
  onHover: (rank: number | null) => void;
  onJump: (sentenceId: number) => void;
  onDiscuss?: (rank: number) => void;
}) {
  return (
    <ol className="flex flex-col gap-2">
      {issues.map((issue) => {
        const active = activeRank === issue.rank;
        return (
          <li
            key={issue.rank}
            onMouseEnter={() => onHover(issue.rank)}
            onMouseLeave={() => onHover(null)}
            className={cn("group relative rounded-[10px] border bg-sheet transition-[border-color,box-shadow] duration-(--dur-layout) ease-(--ease-soft)", active && "border-input shadow-[var(--shadow-float)]")}
          >
            <button type="button" onClick={() => { onSelect(issue.rank); if (issue.sentenceIds[0]) onJump(issue.sentenceIds[0]); }} className="flex w-full items-start gap-2.5 rounded-[10px] px-3.5 pt-3 text-left">
              <IssueBadge rank={issue.rank} className="mt-px size-[22px] text-xs" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-snug">{issue.title}</span>
                {issue.recurring && <span className="mt-1 inline-block text-[11px] text-warn">上次也出现过</span>}
              </span>
            </button>
            <div className="mt-1.5 px-3.5 pb-3.5 pl-[46px]">
              <p className="text-[13.5px] leading-relaxed text-muted-foreground">{issue.why}</p>
              <div className="mt-2.5 rounded-lg bg-coach-soft px-3 py-2.5 text-[13.5px] leading-relaxed">
                <p className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold text-coach"><Lightbulb className="size-3.5" />改写方向</p>
                {issue.hintL1}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <SentenceRefs ids={issue.sentenceIds} onJump={onJump} />
                {onDiscuss && <Button size="sm" variant="outline" onClick={() => onDiscuss(issue.rank)}><MessageSquare />和教练讨论</Button>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
