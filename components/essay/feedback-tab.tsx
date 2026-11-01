"use client";

import { Check, CircleDashed, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IssueList } from "@/components/feedback/issue-list";
import { ScoreCard } from "@/components/feedback/score-card";
import { coachCapabilities } from "@/lib/learning/essay-view";
import { useSession } from "@/lib/prototype/session-store";
import { cn } from "@/lib/utils";
import { useEssayUi } from "./essay-ui";
import { FinishSummary } from "./finish-summary";

const ACHIEVED = { yes: "做到了", partial: "部分做到", no: "还没做到" } as const;

export function FeedbackTab() {
  const { state, actions, coachBusy, lifecycleBusy } = useSession();
  const ui = useEssayUi();
  const evaluation = state.evaluation;
  if (!evaluation) return null;
  const { scores, issues, review } = evaluation;
  const can = coachCapabilities(state);

  return (
    <div className="h-full overflow-y-auto px-5 pt-5 pb-10">
      {state.finish && <div className="mb-8"><FinishSummary /></div>}
      <ScoreCard scores={scores} label={state.mode === "practice" ? "原稿 · 练习成绩" : "原稿 · 模考成绩"} />

      <section className="mt-8">
        <h2 className="mb-1 text-xs text-muted-foreground">先改这 {issues.length} 处</h2>
        {issues.length === 0 ? <p className="py-3 text-sm text-muted-foreground">没有需要优先改的问题</p> : (
          <IssueList
            issues={issues}
            activeRank={ui.hoverRank ?? (ui.version === "original" ? state.activeIssue : null)}
            onSelect={(rank) => { actions.setActiveIssue(rank); ui.setVersion("original"); }}
            onHover={ui.setHoverRank}
            onJump={(id) => { ui.setVersion("original"); ui.jumpToSentence(id); }}
            onDiscuss={can.issue ? ui.discussIssue : undefined}
          />
        )}
      </section>

      {(state.reviewStatus !== "none" || review.focusResult || review.breakthrough || state.mode === "practice") && (
        <section className="mt-8">
          <h2 className="text-xs text-muted-foreground">回顾</h2>
          {state.reviewStatus === "pending" && <p className="mt-3 text-sm text-muted-foreground">提纲回顾处理中，评分与问题反馈已保存。</p>}
          {state.reviewStatus === "failed" && <div className="mt-3 flex items-center gap-3 text-sm">
            <p>提纲回顾失败，评分与问题反馈已保存。</p>
            <Button variant="outline" size="sm" disabled={coachBusy || lifecycleBusy || state.lifecycle !== "open"} onClick={() => void actions.retryReview()}>重试</Button>
          </div>}
          <dl className="mt-3 flex flex-col gap-4 text-[13px] leading-relaxed">
            {state.focus && review.focusResult && (
              <div>
                <dt className="text-xs text-muted-foreground">{state.focus.name}</dt>
                <dd className="mt-1 flex gap-2"><Achieved value={review.focusResult.achieved} /><span>{review.focusResult.note}</span></dd>
              </div>
            )}
            {review.breakthrough && <div><dt className="text-xs text-muted-foreground">突破</dt><dd className="mt-1">{review.breakthrough}</dd></div>}
            {state.mode === "practice" && <div><div className="flex items-baseline justify-between gap-3"><dt className="text-xs text-muted-foreground">站内已采用建议文本占比</dt><dd className="font-mono tabular-nums">{Math.round(review.aiRatio * 100)}%</dd></div><dd className="mt-1 text-xs text-muted-foreground">按已采用且仍完整保留的站内建议文本词数估算；不检测 AI 生成，也不识别外部来源。</dd></div>}
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
