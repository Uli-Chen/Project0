import { DEFAULT_PROFILE } from "@/lib/auth/types";
import { apiError, assertSameOrigin, AuthError, readJson } from "@/lib/auth/http";
import { requireApiUser } from "@/lib/auth/server";
import { profilePatchSchema } from "@/lib/auth/validation";
import { getDb } from "@/lib/db/client";
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
    // An IMMEDIATE transaction protects the merge from writes by other processes.
    const updated = getDb().$client.transaction(() => {
      const current = userById(user.id);
      if (!current) throw new AuthError();
      let raw = {};
      try { raw = JSON.parse(current.profileJson); } catch { /* Legacy empty profile. */ }
      const profile = { ...DEFAULT_PROFILE, ...raw, ...patch };
      const today = new Date(Date.now() + 8 * 60 * 60_000).toISOString().slice(0, 10);
      // An existing plan may have ended. Reject only a newly selected past date.
      const storedDate = (raw as { examDate?: unknown }).examDate;
      if (patch.examDate && patch.examDate < today && patch.examDate !== storedDate) throw new AuthError("考试日期不能早于今天。", 400);
      if (profile.onboardingCompleted && (!profile.target || !profile.perWeek || !(profile.timeBy === "date" ? profile.examDate : profile.weeks || profile.examDate))) {
        throw new AuthError("请先填写目标分、考试时间和每周练习次数。", 400);
      }
      return updateUserProfile(user.id, profile, name);
    }).immediate();
    return Response.json({ user: updated });
  } catch (error) { return apiError(error); }
}

export const PUT = PATCH;
