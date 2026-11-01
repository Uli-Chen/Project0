import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lte } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { authSessions, users } from "@/lib/db/schema";
import { publicUser } from "@/lib/db/queries/users";
import { AuthError } from "./http";

export { AuthError } from "./http";
export type { CurrentUser, UserProfile } from "./types";

const COOKIE = "wm_session";
const MAX_AGE = 60 * 60 * 24 * 30;
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function getCurrentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const result = getDb().select({ user: users }).from(authSessions).innerJoin(users, eq(authSessions.userId, users.id)).where(and(eq(authSessions.tokenHash, tokenHash(token)), gt(authSessions.expiresAt, Date.now()))).get();
  return result ? publicUser(result.user) : null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireApiUser() {
  const user = await getCurrentUser();
  if (!user) throw new AuthError();
  return user;
}

export async function createAuthSession(userId: string, expectedPasswordHash: string) {
  const token = randomBytes(32).toString("hex");
  const db = getDb();
  db.transaction((tx) => {
    // Password verification is asynchronous. A password rotation or account
    // deletion must invalidate credentials checked before that change.
    const owner = tx.select({ id: users.id }).from(users).where(and(eq(users.id, userId), eq(users.passwordHash, expectedPasswordHash))).get();
    if (!owner) throw new AuthError("账户状态已变更，请使用当前密码重新登录。", 401);
    tx.delete(authSessions).where(lte(authSessions.expiresAt, Date.now())).run();
    tx.insert(authSessions).values({ tokenHash: tokenHash(token), userId, expiresAt: Date.now() + MAX_AGE * 1000 }).run();
  });
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE });
}

export async function clearAuthSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) getDb().delete(authSessions).where(eq(authSessions.tokenHash, tokenHash(token))).run();
  jar.set(COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  jar.delete("wm_uid");
}
