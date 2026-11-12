import { DEFAULT_PROFILE } from "@/lib/auth/types";
import { apiError, assertSameOrigin, AuthError, readJson } from "@/lib/auth/http";
import { requireApiUser } from "@/lib/auth/server";
import { profilePatchSchema } from "@/lib/auth/validation";
import { updateUserProfile, userById } from "@/lib/db/queries/users";

export async function GET() {
  try { return Response.json({ user: await requireApiUser() }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { name, ...patch } = profilePatchSchema.parse(await readJson(request, 32_000));
    // Read after the asynchronous request body, then merge and write without
    // another await so unrelated concurrent profile changes aren't discarded.
    const current = userById(user.id);
    if (!current) throw new AuthError();
    let raw = {};
    try { raw = JSON.parse(current.profileJson); } catch { /* Legacy empty profile. */ }
    const profile = { ...DEFAULT_PROFILE, ...raw, ...patch };
    const today = new Date(Date.now() + 8 * 60 * 60_000).toISOString().slice(0, 10);
    // A past date is only refused when it is new: an ended plan that is kept unchanged can still be saved.
    const storedDate = (raw as { examDate?: unknown }).examDate;
    if (patch.examDate && patch.examDate < today && patch.examDate !== storedDate) throw new AuthError("考试日期不能早于今天。", 400);
    if (profile.onboardingCompleted && (!profile.target || !profile.level || !profile.perWeek || !profile.minutes || !profile.difficulties.length || !profile.lang || !(profile.timeBy === "date" ? profile.examDate : profile.weeks || profile.examDate))) {
      throw new AuthError("请先填写完整的学习目标与练习偏好。", 400);
    }
    const updated = updateUserProfile(user.id, profile, name);
    return Response.json({ user: updated });
  } catch (error) { return apiError(error); }
}

export const PUT = PATCH;
