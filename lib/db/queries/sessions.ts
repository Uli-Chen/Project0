import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import type { SessionState } from "@/lib/pipeline/types";
import { readSession } from "@/lib/pipeline/read-session";
import { assertSessionLease } from "@/lib/pipeline/lock";
import { AuthError } from "@/lib/auth/http";
import { getDb } from "../client";
import { completedAtForSession, completedAtForSessions, markPracticeDeleted, recordAttempt } from "../practice-facts";
import { questionContext } from "../question-context";
import { users, writingSessions, checkpoints, completionEvents } from "../schema";

export function getSession(userId: string, id: string): SessionState | null {
  const row = getDb().select().from(writingSessions).where(and(eq(writingSessions.userId, userId), eq(writingSessions.id, id))).get();
  return row ? { ...readSession(row.stateJson), completedAt: completedAtForSession(getDb().$client, userId, id) } : null;
}

// Expired mocks keep a readable draft, but are not practice records or recommendation candidates.
const notExpired = sql`json_extract(${writingSessions.stateJson}, '$.lifecycle') IS NOT 'expired'`;
export function listSessions(userId: string): SessionState[] {
  const completed = completedAtForSessions(getDb().$client, userId);
  return getDb().select().from(writingSessions).where(and(eq(writingSessions.userId, userId), notExpired)).orderBy(desc(writingSessions.updatedAt)).all().map(row => ({ ...readSession(row.stateJson), completedAt: completed.get(row.id) ?? null }));
}

type Cursor = { updatedAt: string; id: string };

export function listSessionSummaries(userId: string, limit: number, cursor?: Cursor) {
  const state = writingSessions.stateJson;
  const stage = sql<SessionState["stage"]>`json_extract(${state}, '$.stage')`;
  const rows = getDb().select({
    id: writingSessions.id,
    createdAt: sql<string>`coalesce(json_extract(${state}, '$.createdAt'), ${writingSessions.createdAt})`,
    updatedAt: writingSessions.updatedAt,
    completedAt: completionEvents.completedAt,
    activity: sql<SessionState["activity"]>`coalesce(json_extract(${state}, '$.activity'), 'deep')`,
    kind: sql<SessionState["kind"]>`json_extract(${state}, '$.kind')`,
    mode: sql<SessionState["mode"]>`json_extract(${state}, '$.mode')`,
    stage,
    lifecycle: sql<SessionState["lifecycle"]>`coalesce(json_extract(${state}, '$.lifecycle'), case when ${stage} = 'finished' then 'closed' else 'open' end)`,
    title: sql<string>`substr(coalesce(json_extract(${state}, '$.question.text'), json_extract(${state}, '$.prompt.text'), ''), 1, 240)`,
  }).from(writingSessions).leftJoin(completionEvents, and(
    eq(completionEvents.userId, writingSessions.userId),
    eq(completionEvents.attemptId, writingSessions.id),
  )).where(and(
    eq(writingSessions.userId, userId),
    notExpired,
    cursor && sql`(${writingSessions.updatedAt}, ${writingSessions.id}) < (${cursor.updatedAt}, ${cursor.id})`,
  )).orderBy(desc(writingSessions.updatedAt), desc(writingSessions.id)).limit(limit + 1).all();

  const sessions = rows.slice(0, limit);
  const last = sessions.at(-1);
  return { sessions, next: rows.length > limit && last ? { updatedAt: last.updatedAt, id: last.id } : null };
}

export function saveSession(userId: string, state: SessionState): void {
  const db = getDb();
  db.$client.transaction(() => {
    assertSessionLease(`${userId}:${state.id}`);
    if (!db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get()) {
      throw new AuthError("账户已退出或删除，无法保存这次练习。", 401);
    }
    if (state.lifecycle === "closed" || state.lifecycle === "expired") db.update(checkpoints).set({ status: "abandoned", reason: state.lifecycle === "expired" ? "到时未达到评估要求" : "练习已关闭" }).where(and(eq(checkpoints.userId, userId), eq(checkpoints.attemptId, state.id), eq(checkpoints.status, "in_progress"))).run();
    const now = new Date().toISOString();
    // Upgrade only at a real write and preserve a future schema version.
    state.schemaVersion = Math.max(2, state.schemaVersion ?? 1);
    const stateJson = JSON.stringify(state);
    db.insert(writingSessions).values({ id: state.id, userId, stateJson, createdAt: now, updatedAt: now }).onConflictDoUpdate({
      target: [writingSessions.userId, writingSessions.id],
      set: { stateJson, updatedAt: now },
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
    assertSessionLease(`${userId}:${id}`);
    const session = getSession(userId, id);
    if (!session) return;
    // Preserve positive exposure even if the startup scan has not reached this old session.
    recordAttempt(sqlite, userId, session, questionContext(sqlite));
    markPracticeDeleted(sqlite, userId, id, new Date().toISOString());
    deletePracticeContent(userId, id);
  }).immediate();
}
