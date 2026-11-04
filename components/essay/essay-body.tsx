"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { DiffText } from "@/components/essay/diff-view";
import { EssayEditor, type EditorSelection, type SelectionAction } from "@/components/essay/essay-editor";
import { EssayReader, type Mark } from "@/components/essay/essay-reader";
import { versionText } from "@/lib/learning/essay-view";
import { useSession } from "@/lib/prototype/session-store";
import { cn } from "@/lib/utils";
import { useEssayRefs, useEssayUi } from "./essay-ui";

/** 中栏的纸面：写前是题目，写作和改写是编辑器，其余是当前版本的只读正文 */
export function EssayBody() {
  const { state, actions, essayKind, coachBusy, lifecycleBusy, pendingActionName } = useSession();
  const ui = useEssayUi();
  const { editorRef } = useEssayRefs();
  const { stage } = state;
  const editing = state.lifecycle === "open" && (stage === "writing" || stage === "revising") && ui.version === essayKind;
  const evaluating = stage === "evaluating" || stage === "re_evaluating";
  const assist = state.mode === "practice" || stage === "revising";
  const issues = state.evaluation?.issues ?? [];

  const handleAction = (action: SelectionAction, selection: EditorSelection) => {
    if (action === "ask") ui.askAbout(selection.text);
    else { actions.assist(action, selection.text); ui.setPanel("coach"); }
  };

  const originalMarks: Mark[] = issues.flatMap((i) => i.sentenceIds.map((sentenceId) => ({ sentenceId, rank: i.rank })));
  const revisionResult = state.comparison?.issues.find((i) => i.rank === state.activeIssue);
  const revisionMarks: Mark[] = (revisionResult?.revisionSentenceIds ?? []).map((sentenceId) => ({ sentenceId, rank: state.activeIssue }));
  const showDiff = ui.version === "revision" && ui.panel === "compare" && ui.compareMode === "diff" && Boolean(state.submitted.revision);

  return (
    <div className="mx-auto w-full max-w-[760px] px-3 py-4 sm:px-6 sm:py-8">
      {evaluating && <EvaluationStatus />}
      <article className="paper min-h-[calc(100dvh-10rem)] px-6 pt-8 pb-14 sm:px-14 sm:pt-11">
        {stage === "prewriting" ? (
          <p className="font-serif text-[26px] leading-[1.45] tracking-[-0.005em]">{state.prompt.text}</p>
        ) : (
          <>
            <p className="prose-prompt text-[16px] text-muted-foreground">{state.prompt.text}</p>
            <div className="mt-6 mb-7 h-px bg-border" />
            {editing ? (
              <EssayEditor
                editorRef={editorRef}
                readOnly={lifecycleBusy || (coachBusy && pendingActionName === "evaluate")}
                value={state.drafts[essayKind]}
                onChange={(text) => actions.setDraft(essayKind, text)}
                assist={assist}
                onAction={assist ? handleAction : undefined}
                onParagraphPause={(index) => actions.requestNudge(essayKind, index)}
                placeholder={stage === "revising" ? "" : "开始写作"}
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
    <div role="status" className="surface mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5 text-[13px]">
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
