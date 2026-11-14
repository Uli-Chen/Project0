import { z } from "zod";
import { apiError, assertSameOrigin, AuthError, readJson } from "@/lib/auth/http";
import { requireApiUser } from "@/lib/auth/server";
import { listSessions } from "@/lib/db/queries/sessions";
import { updateUserProfile, userById } from "@/lib/db/queries/users";
import { DEFAULT_PROFILE, type UserProfile } from "@/lib/auth/types";
import { gradeRequestExpired, gradeReview, reviewItems, type ReviewState } from "@/lib/learning/review-items";

export const runtime = "nodejs";
// `key` names one presentation of a card; the client reuses it when it retries the same grade.
const inputSchema = z.object({ id: z.string().min(1).max(200), result: z.enum(["good", "again"]), key: z.string().min(1).max(100).optional() }).strict();

/** Record one self-graded review. The schedule lives in the user's profile, next to their other preferences. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const input = inputSchema.parse(await readJson(request, 2_000));
    // A request this old may already have lost its receipt; refuse it rather than risk grading twice.
    if (gradeRequestExpired(input.key)) return Response.json({ error: "这张卡片打开太久了，已为你刷新，请重新评分。", code: "review_expired" }, { status: 409 });
    const items = reviewItems(listSessions(user.id));
    if (!items.some(item => item.id === input.id)) throw new AuthError("这条复习内容已不存在。", 404);
    // Read after the awaits and write synchronously, so a concurrent profile save is not overwritten.
    const current = userById(user.id);
    if (!current) throw new AuthError();
    let raw: Partial<UserProfile> = {};
    try { raw = JSON.parse(current.profileJson); } catch { /* Legacy empty profile. */ }
    const live = new Set(items.map(item => item.id));
    const review: ReviewState = Object.fromEntries(Object.entries(raw.review ?? {}).filter(([id]) => live.has(id)));
    const { entry, applied, result } = gradeReview(review[input.id], input.result, input.key);
    review[input.id] = entry;
    if (applied) updateUserProfile(user.id, { ...DEFAULT_PROFILE, ...raw, review });
    // On a replay, `result` is the grade that was recorded for this presentation the first time.
    return Response.json({ review: { box: entry.box, due: entry.due }, result, replayed: !applied });
  } catch (error) { return apiError(error); }
}
