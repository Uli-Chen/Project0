import type { SessionState } from "@/lib/pipeline/types";
import type { EssayKind } from "@/lib/prototype/types";

export type Panel = "coach" | "feedback" | "compare";

/** 哪些检查面板标签可用；顺序即显示顺序 */
export function availablePanels(state: SessionState): Panel[] {
  const panels: Panel[] = [];
  const coachable = state.mode === "practice" ? state.stage !== "evaluating" : Boolean(state.evaluation);
  if (coachable) panels.push("coach");
  if (state.evaluation) panels.push("feedback");
  if (state.comparison) panels.push("compare");
  return panels;
}

export function defaultPanel(state: SessionState): Panel | null {
  const panels = availablePanels(state);
  const preferred: Panel = ["feedback", "re_evaluating"].includes(state.stage) ? "feedback"
    : ["compared", "finished"].includes(state.stage) ? (state.comparison ? "compare" : "feedback")
    : "coach";
  return panels.includes(preferred) ? preferred : panels[0] ?? null;
}

/** 有改写稿（正在改或已提交）时才出现版本切换 */
export function hasRevision(state: SessionState) {
  return state.stage === "revising" || state.stage === "re_evaluating" || Boolean(state.submitted.revision);
}

export function defaultVersion(state: SessionState): EssayKind {
  return hasRevision(state) ? "revision" : "original";
}

/** 教练在当前阶段能接受哪些输入 */
export function coachCapabilities(state: SessionState) {
  const { stage, mode } = state;
  const open = state.lifecycle === "open";
  return {
    prewrite: open && stage === "prewriting",
    chat: open && ((stage === "writing" && mode === "practice") || stage === "revising"),
    issue: open && (stage === "feedback" || stage === "revising"),
  };
}

export function versionText(state: SessionState, kind: EssayKind) {
  return state.submitted[kind] ?? state.drafts[kind];
}
