import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, assertSameOrigin, AuthError, readJson } from "@/lib/auth/http";
import { verifyPassword } from "@/lib/auth/password";
import { limitAuth } from "@/lib/auth/rate-limit";
import { clearAuthSession, requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db/client";
import { userById } from "@/lib/db/queries/users";
import { users } from "@/lib/db/schema";

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const data = z.object({ password: z.string().min(1).max(128), confirmation: z.literal("删除我的账户", { error: "请输入「删除我的账户」确认。" }) }).strict().parse(await readJson(request, 8192));
    limitAuth(`delete:${user.id}`, 8);
    const stored = userById(user.id);
    if (!stored || !await verifyPassword(data.password, stored.passwordHash)) throw new AuthError("密码不正确，账户未删除。", 400);
    const deleted = getDb().delete(users).where(and(eq(users.id, user.id), eq(users.passwordHash, stored.passwordHash))).returning({ id: users.id }).get();
    if (!deleted) throw new AuthError("账户状态已变更，请重新登录后再试。", 409);
    await clearAuthSession();
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
