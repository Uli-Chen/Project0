import "server-only";
import type { CoachMessage, Outline, Slot } from "../prototype/types";
import { actionSchema } from "./schemas";
import type { SessionState } from "./types";

const slot = (value: Slot | undefined): Slot => value ? { text: value.text, sources: value.sources } : null;

function editorOutline(outline: Outline): Outline {
  return {
    stance: slot(outline.stance),
    reasons: (outline.reasons ?? []).map(({ claim, why, example }) => ({ claim: slot(claim), why: slot(why), example: slot(example) })),
    counter: { view: slot(outline.counter?.view), response: slot(outline.counter?.response) },
    userEdited: outline.userEdited,
  };
}

function editorMessage(message: CoachMessage): Omit<CoachMessage, "callId" | "userId"> {
  const { id, role, stage, content, action, quote, suggestionIds, issueRank, level, demoSentence, lang, afterFollowUp, replyToMessageId, targetKey } = message;
  return { id, role, stage, content, action, quote, suggestionIds, issueRank, level, demoSentence, lang, afterFollowUp, replyToMessageId, targetKey };
}

type PendingAction = Omit<NonNullable<SessionState["pendingAction"]>, "tutor">;
function pendingAction(action: SessionState["pendingAction"]): PendingAction | null | undefined {
  if (!action) return action;
  const input = actionSchema.safeParse(action.input);
  if (!input.success) return null;
  return { requestId: action.requestId, input: input.data, startedAt: action.startedAt, error: action.error, retryable: action.retryable };
}

/** The editor can restore drafts and retry an interrupted input from this response. */
export type SessionDetail = Pick<SessionState,
  "id" | "activity" | "kind" | "mode" | "stage" | "lifecycle" | "prompt" | "question" | "focus" | "cardSnapshot" |
  "continuedFromQuickId" | "rewriteOfDeepId" | "createdAt" | "updatedAt" | "lastStudentActionAt" | "savedAt" |
  "originalSubmittedAt" | "completedAt" | "originalFreshness" | "reviewStatus" | "feedbackUpdatedAt" | "checkpointId" |
  "version" | "completedRequests" | "outline" | "prewriteTurns" | "suggestions" | "nudge" | "nudgesEnabled" | "nudgedParagraphs" |
  "drafts" | "submitted" | "elapsed" | "evalStep" | "evalError" | "evaluation" | "revisionScores" | "comparison" |
  "issueLevels" | "activeIssue" | "finish" | "rating"> & {
  messages: Omit<CoachMessage, "callId" | "userId">[];
  pendingAction?: PendingAction | null;
  tutor?: { threads: { prewrite?: { allowedHelp: number } } } | null;
};

export function sessionDetail(state: SessionState): SessionDetail {
  const prewrite = state.tutor?.threads?.prewrite;
  const prompt = state.prompt && { id: state.prompt.id, text: state.prompt.text, topicTags: state.prompt.topicTags, questionType: state.prompt.questionType };
  const question = state.question;
  return {
    id: state.id, activity: state.activity, kind: state.kind, mode: state.mode, stage: state.stage, lifecycle: state.lifecycle,
    prompt,
    question: question && { id: question.id, version: question.version, exposureKey: question.exposureKey, primaryTopic: question.primaryTopic, questionType: question.questionType, text: question.text, bankVersion: question.bankVersion },
    focus: state.focus, cardSnapshot: state.cardSnapshot, continuedFromQuickId: state.continuedFromQuickId, rewriteOfDeepId: state.rewriteOfDeepId,
    createdAt: state.createdAt, updatedAt: state.updatedAt, lastStudentActionAt: state.lastStudentActionAt, savedAt: state.savedAt,
    originalSubmittedAt: state.originalSubmittedAt, completedAt: state.completedAt, originalFreshness: state.originalFreshness,
    reviewStatus: state.reviewStatus, feedbackUpdatedAt: state.feedbackUpdatedAt, checkpointId: state.checkpointId,
    version: state.version, completedRequests: state.completedRequests, pendingAction: pendingAction(state.pendingAction),
    outline: state.outline && editorOutline(state.outline), prewriteTurns: state.prewriteTurns,
    messages: state.messages?.map(editorMessage), suggestions: state.suggestions,
    nudge: state.nudge, nudgesEnabled: state.nudgesEnabled, nudgedParagraphs: state.nudgedParagraphs,
    drafts: state.drafts && { original: state.drafts.original, revision: state.drafts.revision },
    submitted: state.submitted && { original: state.submitted.original, revision: state.submitted.revision },
    elapsed: state.elapsed && { original: state.elapsed.original, revision: state.elapsed.revision },
    evalStep: state.evalStep, evalError: state.evalError, evaluation: state.evaluation, revisionScores: state.revisionScores, comparison: state.comparison,
    issueLevels: state.issueLevels, activeIssue: state.activeIssue, finish: state.finish, rating: state.rating,
    tutor: prewrite ? { threads: { prewrite: { allowedHelp: prewrite.allowedHelp } } } : null,
  };
}

export function quickSessionDetail<T extends { session: SessionState; deepSession?: SessionState }>({ session, deepSession, ...data }: T) {
  return { ...data, session: sessionDetail(session), ...(deepSession ? { deepSession: sessionDetail(deepSession) } : {}) };
}
