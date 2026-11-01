"use client";

import { MessageSquare } from "lucide-react";
import { ISSUE_SOLID } from "@/components/essay/essay-reader";
import { Button } from "@/components/ui/button";
import type { Issue } from "@/lib/prototype/types";
import { cn } from "@/lib/utils";

export function IssueBadge({ rank, className }: { rank: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-medium text-foreground", className)}
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
          <button type="button" onClick={(event) => { event.stopPropagation(); onJump(id); }} className="underline decoration-dotted underline-offset-2 hover:text-foreground">
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
    <ol className="flex flex-col divide-y border-y">
      {issues.map((issue) => {
        const active = activeRank === issue.rank;
        return (
          <li
            key={issue.rank}
            onMouseEnter={() => onHover(issue.rank)}
            onMouseLeave={() => onHover(null)}
            className={cn("group relative py-4 transition-colors", active && "before:absolute before:inset-y-3 before:-left-5 before:w-0.5 before:bg-foreground")}
          >
            <button type="button" onClick={() => { onSelect(issue.rank); if (issue.sentenceIds[0]) onJump(issue.sentenceIds[0]); }} className="flex w-full items-start gap-2.5 text-left">
              <IssueBadge rank={issue.rank} className="mt-px" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-snug">{issue.title}</span>
                {issue.recurring && <span className="mt-1 inline-block text-[11px] text-warn">上次也出现过</span>}
              </span>
            </button>
            <div className="mt-2 pl-7.5">
              <p className="text-[13px] leading-relaxed text-muted-foreground">{issue.why}</p>
              <p className="mt-2 border-l-2 border-coach/50 pl-3 text-[13px] leading-relaxed text-coach">{issue.hintL1}</p>
              <div className="mt-2.5 flex items-center justify-between gap-3">
                <SentenceRefs ids={issue.sentenceIds} onJump={onJump} />
                {onDiscuss && <Button size="xs" variant="ghost" className="-mr-2" onClick={() => onDiscuss(issue.rank)}><MessageSquare />讨论</Button>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
