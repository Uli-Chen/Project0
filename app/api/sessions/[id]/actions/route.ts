import { z } from "zod";
import { withModelAdmission } from "@/lib/llm/admission";
import { assertSupportedSession, sessionApiError as apiError } from "@/lib/pipeline/http";
import { requireApiUser } from "@/lib/auth/server";
import { assertSameOrigin, readJson } from "@/lib/auth/http";
import { getSession, listSessions, saveSession } from "@/lib/db/queries/sessions";
import { actionSchema } from "@/lib/pipeline/schemas";
import { runAction } from "@/lib/pipeline/engine";
import { withSessionLock } from "@/lib/pipeline/lock";
import type { SessionState } from "@/lib/pipeline/types";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request); const user = await requireApiUser(); const { id } = await params;
    assertSupportedSession(getSession(user.id, id));
    const body = await readJson(request);
    const input = actionSchema.parse(body);
    const requestId = z.object({ requestId: z.string().uuid().optional() }).parse(body).requestId ?? crypto.randomUUID();
    return await withSessionLock(`${user.id}:${id}`, async () => {
      const current = getSession(user.id, id);
      assertSupportedSession(current);
      if (requestId && current.completedRequests?.includes(requestId)) return Response.json({ session: current });
      const persist = (state: SessionState) => { state.version++; state.updatedAt = state.savedAt = new Date().toISOString(); saveSession(user.id, state); };
      current.pendingAction = { requestId, input, startedAt: new Date().toISOString() };
      persist(current);
      try {
        const session = await withModelAdmission(user.id, () => runAction(current, input, persist, input.action === "finish" ? listSessions(user.id) : [], user.profile));
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
