import { requireApiUser } from "@/lib/auth/server";
import { assertSameOrigin, readJson } from "@/lib/auth/http";
import { getSession, saveSession } from "@/lib/db/queries/sessions";
import { getDb } from "@/lib/db/client";
import { sessionDetail } from "@/lib/pipeline/session-detail";
import { assertSupportedSession, assertQuickSession, sessionApiError } from "@/lib/pipeline/http";
import { lifecycleSchema } from "@/lib/pipeline/schemas";
import { SessionError } from "@/lib/pipeline/engine";
import { withSessionLock } from "@/lib/pipeline/lock";
import { nextLifecycle } from "@/lib/rules/lifecycle";
import { isStudentAction } from "@/lib/rules/student-action";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request); const user = await requireApiUser(); const { id } = await params;
    const current = getSession(user.id, id);
    if (current?.activity === "quick") assertQuickSession(current); else assertSupportedSession(current);
    const input = lifecycleSchema.parse(await readJson(request));
    return await withSessionLock(`${user.id}:${id}`, () => getDb().$client.transaction(() => {
      const session = getSession(user.id, id);
      if (session?.activity === "quick") assertQuickSession(session); else assertSupportedSession(session);
      const lifecycle = nextLifecycle(session.lifecycle, input.action);
      if (!lifecycle && session.lifecycle === "expired") throw new SessionError("模考已到时结束，不能恢复作答。", 409, "mock_expired");
      if (!lifecycle) throw new SessionError("已关闭的练习请先恢复。", 409, "lifecycle_conflict");
      if (lifecycle === session.lifecycle) return Response.json({ session: sessionDetail(session) });
      session.lifecycle = lifecycle;
      session.version++; session.updatedAt = session.savedAt = new Date().toISOString();
      if (isStudentAction({ kind: "lifecycle" })) session.lastStudentActionAt = session.updatedAt;
      saveSession(user.id, session);
      return Response.json({ session: sessionDetail(session) });
    }).immediate());
  } catch (error) { return sessionApiError(error); }
}
