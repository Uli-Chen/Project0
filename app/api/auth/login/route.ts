import { publicUser, userByEmail } from "@/lib/db/queries/users";
import { apiError, assertSameOrigin, AuthError, readJson } from "@/lib/auth/http";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "@/lib/auth/password";
import { clearAuthLimit, limitAuth } from "@/lib/auth/rate-limit";
import { clearAuthSession, createAuthSession } from "@/lib/auth/server";
import { loginSchema } from "@/lib/auth/validation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const data = loginSchema.parse(await readJson(request, 8192));
    limitAuth(`login:${data.email}`);
    limitAuth("login:global", 300);
    const user = userByEmail(data.email);
    const valid = await verifyPassword(data.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !valid) throw new AuthError("邮箱或密码不正确，请检查后重试。", 401);
    clearAuthLimit(`login:${data.email}`);
    await clearAuthSession();
    await createAuthSession(user.id, user.passwordHash);
    return Response.json({ user: publicUser(user) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
