import { z } from "zod";
import { requireApiUser } from "@/lib/auth/server";
import { assertSameOrigin, readJson } from "@/lib/auth/http";
import { sessionApiError } from "@/lib/pipeline/http";
import { swapCheckpoint } from "@/lib/db/checkpoints";
import { withSessionLock } from "@/lib/pipeline/lock";
import { sessionDetail } from "@/lib/pipeline/session-detail";

export const runtime = "nodejs";

/** "这道题我练过，换一道" on the exam page: swap an untouched mock for a fresh one. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const input = z.object({ attemptId: z.string().min(1).max(200), idempotencyKey: z.string().min(1).max(200) }).strict().parse(await readJson(request));
    return await withSessionLock(`${user.id}:${input.attemptId}`, () =>
      Response.json({ session: sessionDetail(swapCheckpoint(user.id, input.attemptId, input.idempotencyKey)) }));
  } catch (error) { return sessionApiError(error); }
}
