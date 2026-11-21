"use client";

import { useState } from "react";
import { splitSentences } from "@/lib/rules";
import { Check, CircleDashed, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { IssueList } from "@/components/feedback/issue-list";
import { ScoreCard } from "@/components/feedback/score-card";
import { coachCapabilities } from "@/lib/learning/essay-view";
import { useSession } from "@/lib/prototype/session-store";
import { cn } from "@/lib/utils";
import { useEssayUi } from "./essay-ui";
import { FinishSummary } from "./finish-summary";
import { PaceSummary } from "./pace";

const ACHIEVED = { yes: "做到了", partial: "部分做到", no: "还没做到" } as const;

export function FeedbackTab() {
  const { state, actions, coachBusy, lifecycleBusy, tutorV2Enabled } = useSession();
  const ui = useEssayUi();
  const [expanded, setExpanded] = useState(false);
  const evaluation = state.evaluation;
  if (!evaluation) return null;
  const { scores, issues, review } = evaluation;
  const can = coachCapabilities(state);
  const primary = issues.find(i => i.rank === 1) ?? issues[0];
  const folded = tutorV2Enabled && primary ? [primary] : issues;
  const others = tutorV2Enabled && primary ? issues.filter((i) => i !== primary) : [];
  const listProps = {
    activeRank: ui.hoverRank ?? (ui.version === "original" || state.stage === "revising" ? state.activeIssue : null),
    onSelect: (rank: number) => { actions.setActiveIssue(rank); if (state.stage !== "revising") ui.setVersion("original"); },
    onHover: ui.setHoverRank,
    onJump: (id: number) => {
      // 改写时先在改写稿里找这一句；已经改过就回到原稿看它原来的样子
      if (state.stage === "revising" && ui.version === "revision" && ui.locateInDraft(id)) return;
      ui.setVersion("original"); ui.jumpToSentence(id);
    },
    onDiscuss: can.issue && state.lifecycle === "open" ? (tutorV2Enabled ? (rank: number) => void discuss(rank) : ui.discussIssue) : undefined,
  };
  async function discuss(rank: number) {
    if (coachBusy || lifecycleBusy || state.lifecycle !== "open") return;
    if (state.stage === "feedback" && !await actions.startRevision({ openIssue: rank })) return;
    ui.discussIssue(rank);
  }


  return (
    <div className="h-full overflow-y-auto px-4 pt-5 pb-10">
      {state.finish && <div className="mb-8"><FinishSummary /></div>}
      <ScoreCard scores={scores} label={state.mode === "practice" ? "原稿的练习成绩" : "原稿的模考成绩"} />
      <PaceSummary id={state.id} kind="original" text={state.submitted.original ?? ""} />

      <Collapsible open={expanded} onOpenChange={setExpanded} render={<section className="motion-reveal mt-7" style={{ "--i": 2 } as React.CSSProperties} />}>
        <h2 className="mb-2.5 flex items-baseline justify-between text-[15px] font-semibold">{tutorV2Enabled ? "先推进一个问题" : `先改这 ${issues.length} 处`}{!tutorV2Enabled && issues.length > 1 && <span className="text-xs font-normal text-faint">按影响排序</span>}</h2>
        {issues.length === 0 ? <p className="py-3 text-sm text-muted-foreground">没有需要优先改的问题</p> : (
          <>
            <IssueList issues={folded} {...listProps} />
            {others.length > 0 && <CollapsibleContent><div className="-mt-px"><IssueList issues={others} {...listProps} /></div></CollapsibleContent>}
          </>
        )}
        {tutorV2Enabled && primary && <>
          <blockquote className="my-3 border-l-2 border-coach-line pl-3 font-serif text-[15px] leading-relaxed text-muted-foreground italic">{splitSentences(state.submitted.original ?? "").filter(s => primary.sentenceIds.includes(s.id)).map(s => s.text).join(" ")}</blockquote>
          <Button disabled={coachBusy || lifecycleBusy || state.lifecycle !== "open" || !["feedback", "revising"].includes(state.stage)} onClick={() => void discuss(primary.rank)}>改这个问题</Button>
          {issues.length > 1 && <CollapsibleTrigger className="ml-3 text-sm text-muted-foreground underline underline-offset-4 transition-colors duration-(--dur-fast) hover:text-foreground">{expanded ? "收起其他问题" : `还有 ${issues.length - 1} 个问题`}</CollapsibleTrigger>}
        </>}
      </Collapsible>

      {(state.reviewStatus !== "none" || review.focusResult || review.breakthrough || state.mode === "practice") && (
        <section className="motion-reveal mt-7 rounded-xl bg-sunk px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--border)]" style={{ "--i": 3 } as React.CSSProperties}>
          <h2 className="text-[15px] font-semibold">回顾</h2>
          {state.reviewStatus === "pending" && <p className="mt-3 text-sm text-muted-foreground">提纲回顾处理中，评分与问题反馈已保存。</p>}
          {state.reviewStatus === "failed" && <div className="mt-3 flex items-center gap-3 text-sm">
            <p>提纲回顾失败，评分与问题反馈已保存。</p>
            <Button variant="outline" size="sm" disabled={coachBusy || lifecycleBusy || state.lifecycle !== "open"} onClick={() => void actions.retryReview()}>重试</Button>
          </div>}
          <dl className="mt-3 flex flex-col gap-4 text-[14px] leading-relaxed">
            {state.focus && review.focusResult && (
              <div>
                <dt className="text-xs text-muted-foreground">{state.focus.name}</dt>
                <dd className="mt-1 flex gap-2"><Achieved value={review.focusResult.achieved} /><span>{review.focusResult.note}</span></dd>
              </div>
            )}
            {review.breakthrough && <div><dt className="text-xs text-muted-foreground">突破</dt><dd className="mt-1">{review.breakthrough}</dd></div>}
            {state.mode === "practice" && <div><div className="flex items-baseline justify-between gap-3"><dt className="text-xs text-muted-foreground">采纳的教练建议占全文</dt><dd className="font-medium tabular-nums">{Math.round(review.aiRatio * 100)}%</dd></div><dd className="mt-1 text-xs text-muted-foreground">按你采纳后仍留在文中的建议词数估算。</dd></div>}
          </dl>

      </section>
      )}
    </div>
  );
}

function Achieved({ value }: { value: "yes" | "partial" | "no" }) {
  const Icon = value === "yes" ? Check : value === "partial" ? CircleDot : CircleDashed;
  return (
    <span className={cn("flex shrink-0 items-center gap-1 font-medium", value === "yes" ? "text-good" : value === "partial" ? "text-warn" : "text-muted-foreground")}>
      <Icon className="size-3.5" />{ACHIEVED[value]}
    </span>
  );
}
