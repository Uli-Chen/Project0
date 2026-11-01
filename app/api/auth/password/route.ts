import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, assertSameOrigin, AuthError, readJson } from "@/lib/auth/http";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { limitAuth } from "@/lib/auth/rate-limit";
import { createAuthSession, requireApiUser } from "@/lib/auth/server";
import { passwordSchema } from "@/lib/auth/validation";
import { getDb } from "@/lib/db/client";
import { userById } from "@/lib/db/queries/users";
import { authSessions, users } from "@/lib/db/schema";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const data = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema }).strict().parse(await readJson(request, 8192));
    limitAuth(`password:${user.id}`, 8);
    const stored = userById(user.id);
    if (!stored || !await verifyPassword(data.currentPassword, stored.passwordHash)) throw new AuthError("当前密码不正确。", 400);
    if (data.currentPassword === data.newPassword) throw new AuthError("新密码不能与当前密码相同。", 400);
    const passwordHash = await hashPassword(data.newPassword);
    getDb().transaction((tx) => {
      const changed = tx.update(users).set({ passwordHash, updatedAt: new Date().toISOString() }).where(and(eq(users.id, user.id), eq(users.passwordHash, stored.passwordHash))).returning({ id: users.id }).get();
      if (!changed) throw new AuthError("密码已在另一处更新，请重新登录后再试。", 409);
      tx.delete(authSessions).where(eq(authSessions.userId, user.id)).run();
    });
    await createAuthSession(user.id, passwordHash);
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
