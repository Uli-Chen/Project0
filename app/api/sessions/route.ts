import { sessionApiError as apiError } from "@/lib/pipeline/http";
import { requireApiUser } from "@/lib/auth/server";
import { assertSameOrigin, readJson } from "@/lib/auth/http";
import { listSessions } from "@/lib/db/queries/sessions";
import { createSessionSchema } from "@/lib/pipeline/schemas";
import { createSession } from "@/lib/pipeline/initial";
import { createQuestionPractice, saveNewPractice } from "@/lib/db/create-practice";
import { readFeatures } from "@/lib/config/features";
import { SessionError } from "@/lib/pipeline/engine";
export const runtime = "nodejs";
export async function GET() {
  try { const user = await requireApiUser(); return Response.json({ sessions: listSessions(user.id) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const input = createSessionSchema.parse(await readJson(request));
    const enabled = readFeatures().QUESTION_BANK_ENABLED;
    if ("questionId" in input) {
      if (!enabled) throw new SessionError("题库功能尚未开放。", 403, "feature_disabled");
      const { session, status } = createQuestionPractice(user.id, input);
      return Response.json({ session }, { status });
    }
    const session = createSession(input);
    session.lastStudentActionAt = session.createdAt;
    if (!enabled && input.kind === "task") {
      const issue = listSessions(user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).flatMap(s => s.evaluation?.issues ?? []).find(i => !user.profile.excludedMemoryIds.includes(`issue:${i.code || i.title}`));
      if (issue) session.focus = { code: issue.code, name: issue.title, instruction: issue.hintL1, reason: "来自你最近一次作文的反馈。" };
    }
    saveNewPractice(user.id, session);
    return Response.json({ session }, { status: 201 });
  } catch (error) { return apiError(error); }
}
