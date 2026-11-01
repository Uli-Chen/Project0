import { assertSupportedSession, assertOpenSession, sessionApiError as apiError } from "@/lib/pipeline/http";
import { isSupportedSession } from "@/lib/pipeline/read-session";
import { mergeOutline } from "@/lib/pipeline/outline";
import { requireApiUser } from "@/lib/auth/server";
import { assertSameOrigin, readJson } from "@/lib/auth/http";
import { deleteSession, getSession, saveSession } from "@/lib/db/queries/sessions";
import { isStudentAction } from "@/lib/rules/student-action";
import { draftSchema } from "@/lib/pipeline/schemas";
import { SessionError } from "@/lib/pipeline/engine";
import { isReviewRunning } from "@/lib/pipeline/retry-review";
import { isSessionBusy, withSessionLock } from "@/lib/pipeline/lock";
type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireApiUser(); const { id } = await params;
    const session = getSession(user.id, id); if (!session) throw new SessionError("练习不存在。", 404);
    const busy = isSessionBusy(`${user.id}:${id}`) || isReviewRunning(`${user.id}:${id}`);
    // An interrupted optional call is recoverable without scoring again. Read-only projection.
    if (isSupportedSession(session) && session.reviewStatus === "pending" && !busy) {
      session.reviewStatus = "failed";
      session.pendingAction = null;
    }
    return Response.json({ session, busy }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request); const user = await requireApiUser(); const { id } = await params;
    assertSupportedSession(getSession(user.id, id));
    const input = draftSchema.parse(await readJson(request));
    return await withSessionLock(`${user.id}:${id}`, async () => {
      const session = getSession(user.id, id);
      assertSupportedSession(session);
      if (input.requestId && session.lastWriteId === input.requestId) return Response.json({ session });
      assertOpenSession(session);
      if (session.version !== input.version) return Response.json({ error: "这份练习已在其他页面更新。请刷新后继续，你的当前文字仍保留在编辑器。", session }, { status: 409 });
      const before = structuredClone({ drafts: session.drafts, outline: session.outline });
      if (input.drafts) {
        if (["prewriting", "writing"].includes(session.stage)) session.drafts.original = input.drafts.original;
        if (session.stage === "revising") session.drafts.revision = input.drafts.revision;
      }
      if (input.outline && ["prewriting", "writing", "revising"].includes(session.stage)) session.outline = mergeOutline(session.outline, input.outline);
      if (input.nudgesEnabled !== undefined) session.nudgesEnabled = input.nudgesEnabled;
      if (input.elapsed) session.elapsed = { ...session.elapsed, original: Math.max(session.elapsed.original, input.elapsed.original), revision: Math.max(session.elapsed.revision, input.elapsed.revision) };
      if (isStudentAction({ kind: "draft", before, after: session })) session.lastStudentActionAt = new Date().toISOString();
      session.lastWriteId = input.requestId;
      session.version++; session.updatedAt = session.savedAt = new Date().toISOString(); saveSession(user.id, session);
      return Response.json({ session });
    });
  } catch (error) { return apiError(error); }
}
export async function DELETE(request: Request, { params }: Context) {
  try { assertSameOrigin(request); const user = await requireApiUser(); const { id } = await params;
    return await withSessionLock(`${user.id}:${id}`, async () => { if (!getSession(user.id, id)) throw new SessionError("练习不存在。", 404); deleteSession(user.id, id); return Response.json({ ok: true }); });
  } catch (error) { return apiError(error); }
}
