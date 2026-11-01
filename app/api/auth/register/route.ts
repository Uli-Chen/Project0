import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { publicUser, userByEmail } from "@/lib/db/queries/users";
import { apiError, assertSameOrigin, AuthError, readJson } from "@/lib/auth/http";
import { hashPassword } from "@/lib/auth/password";
import { limitAuth } from "@/lib/auth/rate-limit";
import { createAuthSession } from "@/lib/auth/server";
import { registerSchema } from "@/lib/auth/validation";
import { isRegistrationEnabled } from "@/lib/auth/config";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!isRegistrationEnabled()) throw new AuthError("暂未开放注册，请使用已有账户登录。", 403);
    const data = registerSchema.parse(await readJson(request, 8192));
    limitAuth("registration:global", 60, 60 * 60_000);
    limitAuth(`registration:${data.email}`, 5);
    if (userByEmail(data.email)) throw new AuthError("这个邮箱已经注册，请直接登录。", 409);
    const now = new Date().toISOString();
    const passwordHash = await hashPassword(data.password);
    const inserted = getDb().insert(users).values({ id: randomUUID(), email: data.email, name: data.name, passwordHash, createdAt: now, updatedAt: now }).onConflictDoNothing({ target: users.email }).returning().get();
    if (!inserted) throw new AuthError("这个邮箱已经注册，请直接登录。", 409);
    await createAuthSession(inserted.id, passwordHash);
    return Response.json({ user: publicUser(inserted) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
