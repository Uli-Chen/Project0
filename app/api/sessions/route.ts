import { sessionApiError as apiError } from "@/lib/pipeline/http";
import { requireApiUser } from "@/lib/auth/server";
import { assertSameOrigin, readJson } from "@/lib/auth/http";
import { listSessions } from "@/lib/db/queries/sessions";
import { createSessionSchema } from "@/lib/pipeline/schemas";
import { createFreePractice, createQuestionPractice } from "@/lib/db/create-practice";
import { readFeatures } from "@/lib/config/features";
import { SessionError } from "@/lib/pipeline/engine";
import { z } from "zod";
export const runtime = "nodejs";
// Optional only so a page loaded before this change can still start an essay (without the receipt).
const idempotencyKeySchema = z.string().min(1).max(200).optional();
/** Free practice and mocks use the same creation receipt as question-bank practice: the client sends a
 * stable intent key, the server records it once, and a retried lost response returns the same essay.
 * The question-bank schema carries the key itself; for the others it is taken off before validation. */
function splitIntentKey(body: unknown): { payload: unknown; idempotencyKey?: unknown } {
  if (!body || typeof body !== "object" || Array.isArray(body) || "questionId" in body) return { payload: body };
  const { idempotencyKey, ...payload } = body as Record<string, unknown>;
  return { payload, idempotencyKey };
}
export async function GET() {
  try { const user = await requireApiUser(); return Response.json({ sessions: listSessions(user.id) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { payload, idempotencyKey } = splitIntentKey(await readJson(request));
    const input = createSessionSchema.parse(payload);
    const enabled = readFeatures().QUESTION_BANK_ENABLED;
    if ("questionId" in input) {
      if (!enabled) throw new SessionError("题库功能尚未开放。", 403, "feature_disabled");
      const { session, status } = createQuestionPractice(user.id, input);
      return Response.json({ session }, { status });
    }
    const { session, status } = createFreePractice(user.id, input, idempotencyKeySchema.parse(idempotencyKey), session => {
      session.lastStudentActionAt = session.createdAt;
      if (!enabled && input.kind === "task") {
        const issue = listSessions(user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).flatMap(s => s.evaluation?.issues ?? []).find(i => !user.profile.excludedMemoryIds.includes(`issue:${i.code || i.title}`));
        if (issue) session.focus = { code: issue.code, name: issue.title, instruction: issue.hintL1, reason: "来自你最近一次作文的反馈。" };
      }
    });
    return Response.json({ session }, { status });
  } catch (error) { return apiError(error); }
}
