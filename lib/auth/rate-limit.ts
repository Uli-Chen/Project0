import "server-only";
import { createHash } from "node:crypto";
import { eq, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { authAttempts } from "@/lib/db/schema";
import { AuthError } from "./http";

export function limitAuth(key: string, maximum = 12, windowMs = 15 * 60_000) {
  const digest = createHash("sha256").update(key).digest("hex");
  const now = Date.now();
  const db = getDb();
  db.transaction((tx) => {
    tx.delete(authAttempts).where(lte(authAttempts.resetsAt, now)).run();
    const current = tx.select().from(authAttempts).where(eq(authAttempts.key, digest)).get();
    if (current && current.count >= maximum) throw new AuthError("尝试次数过多，请稍后再试。", 429);
    tx.insert(authAttempts).values({ key: digest, count: 1, resetsAt: now + windowMs }).onConflictDoUpdate({ target: authAttempts.key, set: { count: sql`${authAttempts.count} + 1` } }).run();
  });
}

export function clearAuthLimit(key: string) {
  getDb().delete(authAttempts).where(eq(authAttempts.key, createHash("sha256").update(key).digest("hex"))).run();
}
