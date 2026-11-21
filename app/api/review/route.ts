import { z } from "zod";
import { apiError, assertSameOrigin, AuthError, readJson } from "@/lib/auth/http";
import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db/client";
import { getRequestReceipt, writeRequestReceipt } from "@/lib/db/request-receipts";
import { listSessions } from "@/lib/db/queries/sessions";
import { updateUserProfile, userById } from "@/lib/db/queries/users";
import { DEFAULT_PROFILE, type UserProfile } from "@/lib/auth/types";
import { gradeReview, legacyGrade, legacyGrades, reviewItems, type ReviewEntry, type ReviewState } from "@/lib/learning/review-items";

export const runtime = "nodejs";
// `key` names one presentation of a card; the client reuses it when it retries the same grade.
const inputSchema = z.object({ id: z.string().min(1).max(200), result: z.enum(["good", "again"]), key: z.string().min(1).max(100).optional() }).strict();

/**
 * Record one self-graded review. The schedule lives in the user's profile; which presentations were
 * already graded lives in request_receipts (one row per grade, kept until the account is deleted), so
 * a retry after a lost response, or the same request from another tab, never grades twice.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const input = inputSchema.parse(await readJson(request, 2_000));
    const sqlite = getDb().$client, receiptKey = input.key ? `review:${input.key}` : null, now = new Date();
    // Read, decide and write in one transaction, so a concurrent profile save is not overwritten and
    // two copies of the same request cannot both pass the receipt check.
    const outcome = sqlite.transaction(() => {
      const items = reviewItems(listSessions(user.id));
      const item = items.find(candidate => candidate.id === input.id);
      if (!item) throw new AuthError("这条复习内容已不存在。", 404);
      const current = userById(user.id);
      if (!current) throw new AuthError();
      let raw: Partial<UserProfile> = {};
      try { raw = JSON.parse(current.profileJson); } catch { /* Legacy empty profile. */ }
      const live = new Set(items.map(entry => entry.id));
      const review: ReviewState = Object.fromEntries(Object.entries(raw.review ?? {}).filter(([id]) => live.has(id)));
      const existing = review[input.id];
      if (receiptKey) {
        const receipt = getRequestReceipt(sqlite, user.id, receiptKey);
        if (receipt) {
          if (receipt.action !== "review" || receipt.paramsHash !== input.id) throw new AuthError("这次评分和之前的请求对不上，请刷新后再试。", 409);
          return { entry: existing, result: receipt.resultRef as "good" | "again", replayed: true };
        }
        const earlier = legacyGrade(existing, input.key);
        if (earlier) return { entry: existing, result: earlier, replayed: true };
      }
      // The new entry no longer carries receipts an earlier build kept in the profile: move them to the
      // table first, so those old requests stay recognised as replays.
      for (const [oldKey, oldGrade] of legacyGrades(existing)) {
        const key = `review:${oldKey}`;
        if (!getRequestReceipt(sqlite, user.id, key)) writeRequestReceipt(sqlite, { userId: user.id, idempotencyKey: key, attemptId: item.sessionId, action: "review", paramsHash: input.id, resultRef: oldGrade, createdAt: now.toISOString() });
      }
      const entry: ReviewEntry = gradeReview(existing, input.result, now);
      review[input.id] = entry;
      updateUserProfile(user.id, { ...DEFAULT_PROFILE, ...raw, review });
      if (receiptKey) writeRequestReceipt(sqlite, { userId: user.id, idempotencyKey: receiptKey, attemptId: item.sessionId, action: "review", paramsHash: input.id, resultRef: input.result, createdAt: now.toISOString() });
      return { entry, result: input.result, replayed: false };
    }).immediate();
    // On a replay, `result` is the grade that was recorded for this presentation the first time.
    const entry = outcome.entry ?? { box: 0, due: now.toISOString() };
    return Response.json({ review: { box: entry.box, due: entry.due }, result: outcome.result, replayed: outcome.replayed });
  } catch (error) { return apiError(error); }
}
