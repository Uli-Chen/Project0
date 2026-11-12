"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DiffText } from "@/components/essay/diff-view";
import { EssayEditor, type EditorSelection, type SelectionAction } from "@/components/essay/essay-editor";
import { EssayReader, type Mark } from "@/components/essay/essay-reader";
import { versionText } from "@/lib/learning/essay-view";
import { draftMarks, remainingByIssue, type DraftMark } from "@/lib/learning/revision-marks";
import { IssueBadge } from "@/components/feedback/issue-list";
import { useSession } from "@/lib/prototype/session-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEssayRefs, useEssayUi } from "./essay-ui";

/** 中栏的纸面：写前是题目，写作和改写是编辑器，其余是当前版本的只读正文 */
export function EssayBody({ prewrite }: { prewrite?: React.ReactNode } = {}) {
  const { state, actions, essayKind, coachBusy, lifecycleBusy, pendingActionName } = useSession();
  const ui = useEssayUi();
  const { editorRef } = useEssayRefs();
  const { stage } = state;
  const editing = state.lifecycle === "open" && (stage === "writing" || stage === "revising") && ui.version === essayKind;
  const evaluating = stage === "evaluating" || stage === "re_evaluating";
  const assist = state.mode === "practice" || stage === "revising";
  const issues = useMemo(() => state.evaluation?.issues ?? [], [state.evaluation]);

  const handleAction = (action: SelectionAction, selection: EditorSelection) => {
    if (action === "ask") ui.askAbout(selection.text);
    else { actions.assist(action, selection.text); ui.setPanel("coach"); }
  };

  const originalMarks: Mark[] = issues.flatMap((i) => i.sentenceIds.map((sentenceId) => ({ sentenceId, rank: i.rank })));
  const revisionResult = state.comparison?.issues.find((i) => i.rank === state.activeIssue);
  const revisionMarks: Mark[] = (revisionResult?.revisionSentenceIds ?? []).map((sentenceId) => ({ sentenceId, rank: state.activeIssue }));
  const revising = stage === "revising";
  const marks = useMemo(() => revising ? draftMarks(state.submitted.original ?? "", state.drafts.revision, issues) : [], [revising, state.submitted.original, state.drafts.revision, issues]);
  const showDiff = ui.version === "revision" && ui.panel === "compare" && ui.compareMode === "diff" && Boolean(state.submitted.revision);

  return (
    <div className="mx-auto w-full max-w-[800px] px-3 py-4 sm:px-6 sm:py-8">
      {evaluating && <EvaluationStatus />}
      <article className="paper min-h-[calc(100dvh-10rem)] px-6 pt-8 pb-14 sm:px-14 sm:pt-11">
        {stage === "prewriting" ? (
          <>
            <p className="font-serif text-[21px] leading-[1.45] tracking-[-0.005em] text-pretty sm:text-[26px]">{state.prompt.text}</p>
            {prewrite}
          </>
        ) : (
          <>
            <p className="prose-prompt text-[16px] text-muted-foreground">{state.prompt.text}</p>
            <div className="mt-6 mb-7 h-px bg-border" />
            {editing && revising && issues.length > 0 && <RevisionGuide marks={marks} />}
            {editing && !ui.mockStarted ? (
              <div className="flex flex-col items-start gap-4 py-6">
                <h2 className="text-[22px] font-semibold tracking-tight">40 分钟{state.kind === "assessment" ? "入门测试" : "模考"}</h2>
                <ul className="flex flex-col gap-1.5 text-[15px] leading-relaxed text-muted-foreground">
                  <li>独立完成，写作过程中没有教练和提示。</li>
                  <li>至少写 250 词，提交后给出评分和反馈。</li>
                  <li>点下面的按钮后开始倒计时。</li>
                </ul>
                <Button size="lg" className="mt-2" onClick={() => { ui.setMockStarted(true); setTimeout(() => editorRef.current?.focus(), 0); }}>开始计时</Button>
              </div>
            ) : editing ? (
              <EssayEditor
                editorRef={editorRef}
                readOnly={lifecycleBusy || (coachBusy && pendingActionName === "evaluate")}
                value={state.drafts[essayKind]}
                onChange={(text) => actions.setDraft(essayKind, text)}
                assist={assist}
                onAction={assist ? handleAction : undefined}
                onParagraphPause={(index) => actions.requestNudge(essayKind, index)}
                placeholder={stage === "revising" ? "" : "开始写作"}
                marks={revising ? marks : undefined}
                activeRank={revising ? state.activeIssue : null}
                onCaret={revising ? (position) => { const mark = marks.find((m) => position >= m.start && position <= m.end); if (mark && mark.rank !== state.activeIssue) actions.setActiveIssue(mark.rank); } : undefined}
              />
            ) : showDiff ? (
              <div className="prose-essay flex flex-col gap-5">
                {versionText(state, "revision").split(/\n\s*\n/).map((para, i) => <p key={i}><DiffText tone="revision" from={(state.submitted.original ?? "").split(/\n\s*\n/)[i] ?? ""} to={para} /></p>)}
              </div>
            ) : ui.version === "revision" ? (
              <EssayReader text={versionText(state, "revision")} marks={ui.compareMode === "marks" ? revisionMarks : []} activeRank={state.activeIssue} />
            ) : (
              <EssayReader
                text={versionText(state, "original")}
                marks={evaluating ? [] : originalMarks}
                activeRank={ui.hoverRank ?? (ui.panel === "feedback" || stage === "revising" ? state.activeIssue : null)}
                onMarkHover={ui.setHoverRank}
                onMarkClick={(rank) => {
                  actions.setActiveIssue(rank);
                  if (stage === "revising") ui.discussIssue(rank); else ui.setPanel("feedback");
                }}
              />
            )}
          </>
        )}
      </article>
    </div>
  );
}

/** 改写稿上方：每个问题还剩几句没动，点一下跳到下一句 */
function RevisionGuide({ marks }: { marks: DraftMark[] }) {
  const { state, actions } = useSession();
  const ui = useEssayUi();
  const issues = state.evaluation?.issues ?? [];
  const left = remainingByIssue(marks, issues);
  const active = issues.find((i) => i.rank === state.activeIssue) ?? issues[0];
  const go = (rank: number) => {
    actions.setActiveIssue(rank);
    const next = marks.find((m) => m.rank === rank);
    if (next) ui.selectInDraft(next.start, next.end);
  };
  return (
    <div className="mb-7 rounded-xl bg-sunk px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--border)]">
      <div className="flex flex-wrap gap-2">
        {issues.map((issue) => {
          const row = left.find((r) => r.rank === issue.rank)!;
          const on = issue.rank === active.rank;
          return (
            <button key={issue.rank} type="button" onClick={() => go(issue.rank)} aria-pressed={on} className={cn("flex max-w-full items-center gap-2 rounded-full border bg-sheet py-1 pr-3 pl-1.5 text-[14px] transition-colors hover:border-foreground/30", on ? "border-foreground/40 font-medium" : "text-muted-foreground")}>
              <IssueBadge rank={issue.rank} />
              <span className="truncate">{issue.title}</span>
              {row.total > 0 && (row.remaining === 0 ? <Check className="size-3.5 shrink-0 text-good" aria-label="都改过了" /> : <span className="shrink-0 tabular-nums">还剩 {row.remaining} 句</span>)}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-sm leading-relaxed"><span className="text-muted-foreground">改写方向：</span>{active.hintL1}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-muted-foreground">
        <span>带底色的是原稿里被指出、还没改过的句子，改完底色会消失。</span>
        <button type="button" className="text-foreground underline underline-offset-4" onClick={() => ui.discussIssue(active.rank)}>和教练讨论这个问题</button>
      </div>
    </div>
  );
}

function EvaluationStatus() {
  const { state } = useSession();
  const revision = state.stage === "re_evaluating";
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const steps = [{ key: "scoring", label: "评分与诊断" }, { key: "feedback", label: revision ? "对比两稿" : "整理反馈" }];
  const current = state.evalStep === "feedback" ? 1 : 0;

  if (state.evalError) {
    return (
      <div role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-sheet px-5 py-4 text-sm shadow-[var(--shadow-panel)]">
        <p className="font-medium text-destructive">评估没有完成</p>
        <p className="mt-1 text-muted-foreground">{state.evalError}</p>
      </div>
    );
  }
  return (
    <div role="status" className="surface mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5 text-[14px]">
      {steps.map((step, i) => (
        <span key={step.key} className={cn("flex items-center gap-2", i > current && "text-muted-foreground/60")}>
          {i < current ? <Check className="size-3.5 text-good" /> : i === current ? <LoaderCircle className="size-3.5 animate-spin" /> : <span className="size-3.5 rounded-full border border-dashed border-muted-foreground/50" />}
          {step.label}
        </span>
      ))}
      <span className="meta ml-auto">{seconds}s{seconds > 90 ? " · 作文已保存，可以先离开" : ""}</span>
    </div>
  );
}
