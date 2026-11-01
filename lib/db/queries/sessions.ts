import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { SessionState } from "@/lib/pipeline/types";
import { readSession } from "@/lib/pipeline/read-session";
import { AuthError } from "@/lib/auth/http";
import { getDb } from "../client";
import { users, writingSessions } from "../schema";

export function getSession(userId: string, id: string): SessionState | null {
  const row = getDb().select().from(writingSessions).where(and(eq(writingSessions.userId, userId), eq(writingSessions.id, id))).get();
  return row ? readSession(row.stateJson) : null;
}

export function listSessions(userId: string): SessionState[] {
  return getDb().select().from(writingSessions).where(eq(writingSessions.userId, userId)).orderBy(desc(writingSessions.updatedAt)).all().map((row) => readSession(row.stateJson));
}

export function saveSession(userId: string, state: SessionState): void {
  // An LLM response may arrive after the owner deleted their account.
  // Keep this check and write synchronous; the FK also guards other processes.
  if (!getDb().select({ id: users.id }).from(users).where(eq(users.id, userId)).get()) {
    throw new AuthError("账户已退出或删除，无法保存这次练习。", 401);
  }
  const now = new Date().toISOString();
  // Upgrade only at a real write; never downgrade a future schema.
  state.schemaVersion = Math.max(2, state.schemaVersion ?? 1);
  getDb().insert(writingSessions).values({ id: state.id, userId, stateJson: JSON.stringify(state), createdAt: now, updatedAt: now }).onConflictDoUpdate({
    target: [writingSessions.userId, writingSessions.id],
    set: { stateJson: JSON.stringify(state), updatedAt: now },
  }).run();
}

export function deleteSession(userId: string, id: string): void {
  getDb().delete(writingSessions).where(and(eq(writingSessions.userId, userId), eq(writingSessions.id, id))).run();
}
