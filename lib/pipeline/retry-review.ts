import "server-only";
import { isStudentAction } from "../rules/student-action";
import { getSession, saveSession } from "../db/queries/sessions";
import { getDb } from "../db/client";
import { acquireExecution, isExecutionActive } from "../db/execution-leases";
import { withModelAdmission } from "../llm/admission";
import { runAction, SessionError } from "./engine";
import { assertSupportedSession, assertOpenSession } from "./http";
import { withSessionLock } from "./lock";
import type { SessionState } from "./types";

export const isReviewRunning = (key: string) => isExecutionActive("review", key);
const persist = (userId: string, state: SessionState) => {
  state.version++; state.updatedAt = state.savedAt = new Date().toISOString(); saveSession(userId, state);
};

/** New model action: reserve under lock, call without lock, merge under lock.
 * Only review fields are merged, preserving concurrent saves and deletion. */
export async function retryReview(userId: string, id: string, requestId: string) {
  const key = `${userId}:${id}`;
  const sqlite = getDb().$client;
  const snapshot = await withSessionLock(key, () => sqlite.transaction(() => {
    const state = getSession(userId, id);
    assertSupportedSession(state);
    if (state.completedRequests?.includes(requestId)) return { state };
    assertOpenSession(state);
    if (isReviewRunning(key)) throw new SessionError("提纲回顾正在处理中。", 409);
    if (!["feedback", "revising", "compared", "finished"].includes(state.stage) || !state.evaluation || !state.submitted.original) throw new SessionError("尚无可回顾的原稿。", 409);
    if (state.reviewStatus === "none" || state.reviewStatus === "ok") return { state };
    const lease = acquireExecution("review", key, sqlite);
    if (!lease) throw new SessionError("提纲回顾正在处理中。", 409);
    if (isStudentAction({ kind: "action", action: "retryReview" })) state.lastStudentActionAt = new Date().toISOString();
    state.reviewStatus = "pending";
    state.pendingAction = { requestId, input: { action: "retryReview" }, startedAt: new Date().toISOString() };
    persist(userId, state);
    return { state, lease };
  }).immediate());
  if (!snapshot.lease) return snapshot.state;
  const { lease } = snapshot;
  lease.keepAlive();
  try {
    const result = await withModelAdmission(userId, () => runAction(snapshot.state, { action: "retryReview" }, () => {}, [], undefined, { userId, operationId: requestId }));
    return await withSessionLock(key, () => sqlite.transaction(() => {
      const current = getSession(userId, id);
      assertSupportedSession(current); // Never upsert deleted content.
      if (!lease.current() || current.pendingAction?.requestId !== requestId) throw new SessionError("练习已更新，请刷新后重试回顾。", 409);
      const sameInputs = JSON.stringify(current.outline) === JSON.stringify(snapshot.state.outline)
        && JSON.stringify(current.focus) === JSON.stringify(snapshot.state.focus)
        && current.submitted.original === snapshot.state.submitted.original;
      current.reviewStatus = sameInputs ? result.reviewStatus : "failed";
      if (sameInputs && result.reviewStatus === "ok") current.evaluation!.review = result.evaluation!.review;
      current.pendingAction = null;
      current.completedRequests = [...(current.completedRequests ?? []), requestId].slice(-50);
      persist(userId, current);
      return current;
    }).immediate());
  } finally { lease.release(); }
}
