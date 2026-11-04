import "server-only";
import { eq } from "drizzle-orm";
import { DEFAULT_PROFILE, type CurrentUser, type UserProfile } from "@/lib/auth/types";
import { getDb } from "../client";
import { users } from "../schema";

export function userByEmail(email: string) {
  return getDb().select().from(users).where(eq(users.email, email)).get();
}

export function userById(id: string) {
  return getDb().select().from(users).where(eq(users.id, id)).get();
}

export function publicUser(user: typeof users.$inferSelect): CurrentUser {
  let profile: Partial<UserProfile> = {};
  try { profile = JSON.parse(user.profileJson) as Partial<UserProfile>; } catch { /* Recover legacy empty profiles. */ }
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt, profile: { ...DEFAULT_PROFILE, ...profile, explainLanguage: profile.explainLanguage === "zh" ? "zh" : "en", nudgesDefault: profile.nudgesDefault !== false } };
}

export function updateUserProfile(userId: string, profile: UserProfile, name?: string): CurrentUser {
  getDb().update(users).set({ profileJson: JSON.stringify(profile), ...(name ? { name } : {}), updatedAt: new Date().toISOString() }).where(eq(users.id, userId)).run();
  const user = userById(userId);
  if (!user) throw new Error("User no longer exists");
  return publicUser(user);
}
