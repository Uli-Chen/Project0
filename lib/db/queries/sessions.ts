import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { SessionState } from "@/lib/pipeline/types";
import { readSession } from "@/lib/pipeline/read-session";
import { AuthError } from "@/lib/auth/http";
import { getDb } from "../client";
import { completedAtForSession, completedAtForSessions, markPracticeDeleted, recordAttempt } from "../practice-facts";
import { questionContext } from "../question-context";
import { users, writingSessions, checkpoints } from "../schema";

export function getSession(userId: string, id: string): SessionState | null {
  const row = getDb().select().from(writingSessions).where(and(eq(writingSessions.userId, userId), eq(writingSessions.id, id))).get();
  return row ? { ...readSession(row.stateJson), completedAt: completedAtForSession(getDb().$client, userId, id) } : null;
}

export function listSessions(userId: string): SessionState[] {
  const completed = completedAtForSessions(getDb().$client, userId);
  return getDb().select().from(writingSessions).where(eq(writingSessions.userId, userId)).orderBy(desc(writingSessions.updatedAt)).all().map(row => ({ ...readSession(row.stateJson), completedAt: completed.get(row.id) ?? null }));
}

export function saveSession(userId: string, state: SessionState): void {
  // An LLM response may arrive after the owner deleted their account.
  // Keep this check and write synchronous; the FK also guards other processes.
  if (!getDb().select({ id: users.id }).from(users).where(eq(users.id, userId)).get()) {
    throw new AuthError("账户已退出或删除，无法保存这次练习。", 401);
  }
  getDb().$client.transaction(() => {
  if(state.lifecycle === "closed") getDb().update(checkpoints).set({status:"abandoned",reason:"练习已关闭"}).where(and(eq(checkpoints.userId,userId),eq(checkpoints.attemptId,state.id),eq(checkpoints.status,"in_progress"))).run();
  const now = new Date().toISOString();
  // Upgrade only at a real write; never downgrade a future schema.
  state.schemaVersion = Math.max(2, state.schemaVersion ?? 1);
  getDb().insert(writingSessions).values({ id: state.id, userId, stateJson: JSON.stringify(state), createdAt: now, updatedAt: now }).onConflictDoUpdate({
    target: [writingSessions.userId, writingSessions.id],
    set: { stateJson: JSON.stringify(state), updatedAt: now },
  }).run();
  }).immediate();
}

/** Central content deletion boundary. Composite owner/session FKs cascade topic_cards,
 * quick_check_results and quick_operation_inputs (covered by deletion tests).
 * Retained facts/receipts never belong in this function. */
function deletePracticeContent(userId: string, id: string): void {
  getDb().delete(writingSessions).where(and(eq(writingSessions.userId, userId), eq(writingSessions.id, id))).run();
}

export function deleteSession(userId: string, id: string): void {
  const sqlite = getDb().$client;
  sqlite.transaction(() => {
    const session = getSession(userId, id);
    if (!session) return;
    // Preserve positive exposure even if the startup scan has not reached this old session.
    recordAttempt(sqlite, userId, session, questionContext(sqlite));
    markPracticeDeleted(sqlite, userId, id, new Date().toISOString());
    deletePracticeContent(userId, id);
  }).immediate();
}
