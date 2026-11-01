import type { SessionState } from "./types";

/** v1/v2 share missing-field defaults. Keep the source version until a real save.
 * No validation/stripping of stored JSON: a rollback must retain future fields. */
export function readSession(json: string): SessionState {
  const state = JSON.parse(json);
  const schemaVersion = state.schemaVersion ?? 1;
  return {
    activity: "deep", question: null,
    lifecycle: state.stage === "finished" ? "closed" : "open",
    lastStudentActionAt: null, continuedFromQuickId: null, cardSnapshot: null,
    rewriteOfDeepId: null, originalSubmittedAt: null, completedAt: null,
    originalFreshness: null, reviewStatus: "none", feedbackUpdatedAt: null, checkpointId: null,
    ...state, schemaVersion,
  };
}

/** Only Deep's existing stages are editable, independently of feature flags. */
export function isSupportedSession(state: { activity: unknown; stage: unknown }): boolean {
  return state.activity === "deep" && typeof state.stage === "string" &&
    ["prewriting", "writing", "evaluating", "feedback", "revising", "re_evaluating", "compared", "finished"].includes(state.stage);
}
