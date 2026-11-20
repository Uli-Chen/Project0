import "server-only";
import { readFeatures } from "../config/features";
import { promptConfigVersion } from "../llm/budget";
import type { UserProfile } from "../auth/types";
import type { SessionState } from "../pipeline/types";
import type { AgentAction } from "../pipeline/schemas";

export type TutorExecution = { v2: boolean; explainLanguage: "en" | "zh"; promptConfigVersion: string };
export const tutorActions = new Set(["prewrite", "chat", "clarify", "polish", "express", "check", "issue", "nudge"]);
export function newTutorExecution(profile?: UserProfile): TutorExecution {
  return { v2: readFeatures().TUTOR_V2_ENABLED, explainLanguage: profile?.explainLanguage === "en" ? "en" : "zh", promptConfigVersion };
}
export function executionFor(state: SessionState, input: AgentAction, requestId: string, profile: UserProfile): TutorExecution {
  const old = state.pendingAction;
  if (old?.requestId === requestId && tutorActions.has(input.action)) {
    if (old.retryable === false || !old.tutor || old.tutor.promptConfigVersion !== promptConfigVersion || JSON.stringify(old.input) !== JSON.stringify(input)) throw new Error("上次请求已失效，你的文字已保留，请重新发送。");
    return old.tutor;
  }
  return newTutorExecution(profile);
}
