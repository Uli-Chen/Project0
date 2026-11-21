"use client";

import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Issue } from "@/lib/prototype/types";
import { cn } from "@/lib/utils";

/** 问题编号：统一教练蓝，靠数字区分；选中或悬停时填实 */
export function IssueBadge({ rank, active = false, className }: { rank: number; active?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-[22px] shrink-0 items-center justify-center rounded-full text-[14px] leading-none font-semibold tabular-nums transition-colors duration-(--dur-fast)",
        active ? "bg-coach text-sheet" : "bg-coach-soft text-coach shadow-[inset_0_0_0_1px_var(--coach-line)]",
        className,
      )}
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

/** 按影响排序的问题，细线分隔；悬停或选中时编号填实，正文对应句子加深 */
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
    <ol className="motion-stagger flex flex-col divide-y border-y">
      {issues.map((issue) => {
        const active = activeRank === issue.rank;
        return (
          <li key={issue.rank} onMouseEnter={() => onHover(issue.rank)} onMouseLeave={() => onHover(null)} className="-mx-2 rounded-lg px-2 py-4 transition-colors duration-(--dur-fast) hover:bg-sunk/70">
            <button type="button" aria-pressed={active} onClick={() => { onSelect(issue.rank); if (issue.sentenceIds[0]) onJump(issue.sentenceIds[0]); }} className="flex w-full items-start gap-2.5 text-left">
              <IssueBadge rank={issue.rank} active={active} className="-mt-px" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-snug">{issue.title}</span>
                {issue.recurring && <span className="mt-1 inline-block text-[14px] text-warn">上次也出现过</span>}
              </span>
            </button>
            <div className="mt-1.5 pl-8">
              <p className="text-[14.5px] leading-relaxed text-muted-foreground">{issue.why}</p>
              <div className="mt-3 border-l-2 border-coach-line pl-3 text-[14.5px] leading-relaxed">
                <p className="text-[14px] font-semibold text-coach">改写方向</p>
                <p className="mt-0.5">{issue.hintL1}</p>
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
