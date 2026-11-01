import { createSession } from "../../lib/pipeline/initial";

export const newSessionFields = ["schemaVersion", "activity", "question", "lifecycle", "lastStudentActionAt", "continuedFromQuickId", "cardSnapshot", "rewriteOfDeepId", "originalSubmittedAt", "completedAt", "feedbackUpdatedAt", "checkpointId"] as const;

export function legacySession() {
  const state = createSession({ kind: "free", mode: "practice", prompt: "Should cities provide free public transport?" });
  state.createdAt = "2025-01-02T03:04:05.000Z";
  state.updatedAt = state.savedAt = "2025-02-03T04:05:06.000Z";
  const legacy: Record<string, unknown> = { ...state,
    futureFlag: false, futureData: { nested: [{ text: "保留", n: 0, missing: null }] },
    prompt: { ...state.prompt, futurePrompt: { aliases: ["a", "b"] } },
    outline: { ...state.outline, futureOutline: [1, { keep: true }],
      stance: { text: "I agree", sources: ["user"], futureSlot: { keep: 7 } },
      reasons: state.outline.reasons.map(reason => ({ ...reason, futureReason: "keep" })),
      counter: { ...state.outline.counter, futureCounter: true },
    },
    drafts: { ...state.drafts, futureDraft: { text: "保留草稿" } },
    elapsed: { ...state.elapsed, futureElapsed: 17 },
  };
  for (const field of newSessionFields) delete legacy[field];
  return legacy;
}
