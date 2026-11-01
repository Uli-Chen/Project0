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
import { commitPracticeCheckpoint } from "@/lib/db/practice-facts";
import { retryReview, isReviewRunning } from "@/lib/pipeline/retry-review";
import { assertOriginalEvaluationStage, runAction, SessionError } from "@/lib/pipeline/engine";
import { withSessionLock } from "@/lib/pipeline/lock";
import type { SessionState } from "@/lib/pipeline/types";
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
      if (["quickFollowup", "quickCheck", "quickRetry", "quickSupplemental"].includes(action)) return Response.json(await withModelAdmission(user.id, () => runQuickModel(user.id, id, quickModelActionSchema.parse(body))));
      return Response.json(commitQuickMutation(user.id, id, quickActionSchema.parse(body)));
    }
    assertSupportedSession(currentSession);
    if (quickActionNames.has(action)) throw new SessionError("精练不支持速刷动作。", 409, "unsupported_session");
    const input = actionSchema.parse(body);
    const requestId = z.object({ requestId: z.string().uuid().optional() }).parse(body).requestId ?? crypto.randomUUID();
    if (input.action === "retryReview") return Response.json({ session: await retryReview(user.id, id, requestId) });
    return await withSessionLock(`${user.id}:${id}`, async () => {
      if (isReviewRunning(`${user.id}:${id}`)) throw new SessionError("提纲回顾正在处理中。", 409);
      const current = getSession(user.id, id);
      assertSupportedSession(current);
      if (requestId && current.completedRequests?.includes(requestId)) return Response.json({ session: current });
      assertOpenSession(current);
      // Reject original regrading before writing pendingAction or changing timestamps.
      if (input.action === "evaluate" && input.kind === "original") assertOriginalEvaluationStage(current);
      const persist = (state: SessionState) => { state.version++; state.updatedAt = state.savedAt = new Date().toISOString(); saveSession(user.id, state); };
      if (isStudentAction({ kind: "action", action: input.action })) current.lastStudentActionAt = new Date().toISOString();
      current.pendingAction = { requestId, input, startedAt: new Date().toISOString() };
      persist(current);
      try {
        const session = await withModelAdmission(user.id, () => runAction(current, input, (state, event) => event ? commitPracticeCheckpoint(getDb().$client, user.id, state, event, persist) : persist(state), input.action === "finish" ? listSessions(user.id) : [], user.profile));
        session.completedRequests = [...(session.completedRequests ?? []), requestId].slice(-50);
        session.pendingAction = null;
        persist(session);
        return Response.json({ session });
      } catch (error) {
        const response = apiError(error);
        const payload = await response.json();
        const session = getSession(user.id, id);
        if (session?.pendingAction?.requestId === requestId) {
          // Keep retriable requests and their text recoverable after a refresh.
          session.pendingAction = (response.status >= 500 || response.status === 429) ? { ...session.pendingAction, error: payload.error } : null;
          persist(session);
        }
        return Response.json({ ...payload, session }, { status: response.status, headers: response.headers });
      }
    });
  } catch (error) { return apiError(error); }
}
