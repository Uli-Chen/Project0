import { z } from "zod";
import { apiError, assertSameOrigin, AuthError, readJson } from "@/lib/auth/http";
import { requireApiUser } from "@/lib/auth/server";
import { listSessions } from "@/lib/db/queries/sessions";
import { updateUserProfile, userById } from "@/lib/db/queries/users";
import { DEFAULT_PROFILE, type UserProfile } from "@/lib/auth/types";
import { nextReview, reviewItems, type ReviewState } from "@/lib/learning/review-items";

export const runtime = "nodejs";
const inputSchema = z.object({ id: z.string().min(1).max(200), result: z.enum(["good", "again"]) }).strict();

/** Record one self-graded review. The schedule lives in the user's profile, next to their other preferences. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const input = inputSchema.parse(await readJson(request, 2_000));
    const items = reviewItems(listSessions(user.id));
    if (!items.some(item => item.id === input.id)) throw new AuthError("这条复习内容已不存在。", 404);
    // Read after the awaits and write synchronously, so a concurrent profile save is not overwritten.
    const current = userById(user.id);
    if (!current) throw new AuthError();
    let raw: Partial<UserProfile> = {};
    try { raw = JSON.parse(current.profileJson); } catch { /* Legacy empty profile. */ }
    const live = new Set(items.map(item => item.id));
    const review: ReviewState = Object.fromEntries(Object.entries(raw.review ?? {}).filter(([id]) => live.has(id)));
    review[input.id] = nextReview(review[input.id], input.result);
    updateUserProfile(user.id, { ...DEFAULT_PROFILE, ...raw, review });
    return Response.json({ review: review[input.id] });
  } catch (error) { return apiError(error); }
}
