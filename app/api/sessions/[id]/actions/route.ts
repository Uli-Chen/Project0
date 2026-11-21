import { executionFor, tutorActions } from "@/lib/tutor/execution";
import { publicUser, userById } from "@/lib/db/queries/users";
import { runQuickModel } from "@/lib/pipeline/quick-model";
import { quickModelActionSchema } from "@/lib/quick/schemas";
import { commitQuickMutation } from "@/lib/pipeline/quick";
import { quickActionNames, quickActionSchema } from "@/lib/quick/schemas";
import { assertQuickSession } from "@/lib/pipeline/http";
import { isStudentAction } from "@/lib/rules/student-action";
import { z } from "zod";
import { withModelAdmission } from "@/lib/llm/admission";
import { assertSupportedSession, assertOpenSession, sessionApiError as apiError } from "@/lib/pipeline/http";
import { requireApiUser } from "@/lib/auth/server";
import { assertSameOrigin, readJson } from "@/lib/auth/http";
import { getSession, listSessions, saveSession } from "@/lib/db/queries/sessions";
import { actionSchema } from "@/lib/pipeline/schemas";
import { getDb } from "@/lib/db/client";
import { sessionCheckpoint } from "@/lib/db/checkpoints";
import { checkInput } from "@/lib/rules/check-input";
import { MOCK_DURATION_SECONDS } from "@/lib/rules/checkpoint";
import { commitPracticeCheckpoint } from "@/lib/db/practice-facts";
import { retryReview, isReviewRunning } from "@/lib/pipeline/retry-review";
import { assertOriginalEvaluationStage, runAction, SessionError } from "@/lib/pipeline/engine";
import { withSessionLock } from "@/lib/pipeline/lock";
import type { SessionState } from "@/lib/pipeline/types";
import { quickSessionDetail, sessionDetail } from "@/lib/pipeline/session-detail";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request); const user = await requireApiUser(); const { id } = await params;
    const currentSession = getSession(user.id, id);
    if (currentSession?.activity === "quick") assertQuickSession(currentSession);
    else assertSupportedSession(currentSession);
    const body = await readJson(request);
    const action = z.object({ action: z.string() }).parse(body).action;
    if (currentSession.activity === "quick") {
      assertQuickSession(currentSession);
      if (!quickActionNames.has(action)) throw new SessionError("速刷不支持精练动作。", 409, "unsupported_session");
      if (["quickFollowup", "quickCheck", "quickRetry", "quickSupplemental"].includes(action)) return Response.json(quickSessionDetail(await withModelAdmission(user.id, () => runQuickModel(user.id, id, quickModelActionSchema.parse(body)))));
      return Response.json(quickSessionDetail(commitQuickMutation(user.id, id, quickActionSchema.parse(body))));
    }
    assertSupportedSession(currentSession);
    if (quickActionNames.has(action)) throw new SessionError("精练不支持速刷动作。", 409, "unsupported_session");
    const input = actionSchema.parse(body);
    const requestId = z.object({ requestId: z.string().uuid().optional() }).parse(body).requestId ?? crypto.randomUUID();
    if (input.action === "retryReview") return Response.json({ session: sessionDetail(await retryReview(user.id, id, requestId)) });
    return await withSessionLock(`${user.id}:${id}`, async () => {
      if (isReviewRunning(`${user.id}:${id}`)) throw new SessionError("提纲回顾正在处理中。", 409);
      const current = getSession(user.id, id);
      assertSupportedSession(current);
      if (requestId && current.completedRequests?.includes(requestId)) return Response.json({ session: sessionDetail(current) });
      const persist = (state: SessionState) => { state.version++; state.updatedAt = state.savedAt = new Date().toISOString(); saveSession(user.id, state); };
      if (input.action === "evaluate" && input.atDeadline) {
        if (current.mode !== "mock" || input.kind !== "original") throw new SessionError("只有模考原稿可以到时交卷。", 409);
        if (current.lifecycle === "expired" || current.submitted.original !== null) return Response.json({ session: sessionDetail(current) });
        const cp = current.checkpointId ? sessionCheckpoint(user.id, id) : undefined;
        const due = current.checkpointId ? cp?.status === "in_progress" && Date.now() >= Date.parse(cp.deadlineAt) : current.elapsed.original >= MOCK_DURATION_SECONDS;
        if (!due || current.stage !== "writing" || current.lifecycle === "closed") throw new SessionError("这次模考不在到时交卷状态。", 409);
        if (checkInput(current.drafts.original, current.prompt.text, "original")) {
          // Do not accept an original or enter model admission: neither scoring nor completion credit is due.
          current.lifecycle = "expired";
          current.pendingAction = null;
          current.completedRequests = [...(current.completedRequests ?? []), requestId].slice(-50);
          persist(current);
          return Response.json({ session: sessionDetail(current) });
        }
        // Independent mocks keep running while set aside. Hand in the saved original without an edit round trip.
        current.lifecycle = "open";
      }
      assertOpenSession(current);
      // Reject original regrading before writing pendingAction or changing timestamps.
      if (input.action === "evaluate" && input.kind === "original") assertOriginalEvaluationStage(current);
      if (isStudentAction({ kind: "action", action: input.action })) current.lastStudentActionAt = new Date().toISOString();
      const latestUser = userById(user.id);
      if (!latestUser) throw new SessionError("账户已不存在。", 401);
      const profile = publicUser(latestUser).profile;
      let execution;
      try { execution = executionFor(current, input, requestId, profile); }
      catch (error) {
        const message = error instanceof Error ? error.message : "请重新发送。";
        if (current.pendingAction) current.pendingAction = { ...current.pendingAction, error: message, retryable: false };
        persist(current);
        return Response.json({ error: message, session: sessionDetail(current) }, { status: 409 });
      }
      if (!execution.v2 && input.action === "prewrite" && input.intent) throw new SessionError("当前版本不支持给点提示。", 400);
      current.pendingAction = { requestId, input, startedAt: new Date().toISOString(), tutor: execution };
      persist(current);
      const acceptedVersion = current.version;
      const acceptedTutor = JSON.stringify(current.tutor);
      const beforeTutorCommit = () => {
        const latest = getSession(user.id, id);
        if (!latest || !userById(user.id) || latest.version !== acceptedVersion || JSON.stringify(latest.tutor) !== acceptedTutor) throw new SessionError("设置已更改，请重新发送。你的文字已保留。", 409, "tutor_stale");
      };
      try {
        const session = await withModelAdmission(user.id, () => runAction(current, input, (state, event) => event ? commitPracticeCheckpoint(getDb().$client, user.id, state, event, persist) : persist(state), input.action === "finish" ? listSessions(user.id) : [], profile, { userId: user.id, operationId: requestId, beforeTutorCommit }));
        if (execution.v2 && tutorActions.has(input.action)) beforeTutorCommit();
        session.completedRequests = [...(session.completedRequests ?? []), requestId].slice(-50);
        session.pendingAction = null;
        persist(session);
        return Response.json({ session: sessionDetail(session) });
      } catch (error) {
        const response = apiError(error);
        const payload = await response.json();
        const session = getSession(user.id, id);
        if (session?.pendingAction?.requestId === requestId) {
          // Keep retriable requests and their text recoverable after a refresh.
          session.pendingAction = error instanceof SessionError && error.code === "tutor_stale" && tutorActions.has(input.action) ? { ...session.pendingAction, error: payload.error, retryable: false } : (response.status >= 500 || response.status === 429) ? { ...session.pendingAction, error: payload.error } : null;
          persist(session);
        }
        return Response.json({ ...payload, session: session && sessionDetail(session) }, { status: response.status, headers: response.headers });
      }
    });
  } catch (error) { return apiError(error); }
}
