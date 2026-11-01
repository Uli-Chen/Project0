import type Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import { attemptMarkers, checkpoints, completionEvents, familiarity, legacyScan, writingSessions } from "./schema";
import { questionContext, resolveAttempt, type QuestionContext } from "./question-context";
import { originalFreshness } from "../rules/original-freshness";
import { readSession } from "../pipeline/read-session";
import type { SessionState } from "../pipeline/types";

export type PracticeCheckpoint = "acceptOriginal" | "completeOriginal";
const ownedAttempt = (userId: string, id: string) => and(eq(writingSessions.userId, userId), eq(writingSessions.id, id));
const ownedEvent = (userId: string, id: string) => and(eq(completionEvents.userId, userId), eq(completionEvents.attemptId, id));

export function recordAttempt(sqlite: Database.Database, userId: string, state: SessionState, context: QuestionContext) {
  const db = drizzle(sqlite), resolved = resolveAttempt(state, context);
  const { resolution, ...metadata } = resolved;

  db.insert(attemptMarkers).values({ userId, attemptId: state.id, activity: state.activity, mode: state.mode,
    ...metadata, resolution: resolution.result, createdAt: state.createdAt ?? null }).onConflictDoNothing().run();
  // A reviewed alias may resolve a formerly ambiguous marker. Never discard
  // an already-positive family or change a frozen question snapshot.
  const key = and(eq(attemptMarkers.userId, userId), eq(attemptMarkers.attemptId, state.id));
  const marker = db.select().from(attemptMarkers).where(key).get()!;
  if (!marker.exposureKey && ["ambiguous", "unmatched"].includes(marker.resolution)) {
    db.update(attemptMarkers).set({ exposureKey: resolved.exposureKey, resolution: resolution.result }).where(key).run();
  }
  if (resolved.exposureKey) db.insert(familiarity).values({ userId, exposureKey: resolved.exposureKey,
    firstAttemptId: state.id, firstAttemptAt: state.createdAt ?? null }).onConflictDoNothing().run();
  return resolved;
}

/** Missing scan is unknown even when startup scanning failed. No fail-open path. */
export function isExposureUnknown(sqlite: Database.Database, userId: string, exposureKey: string) {
  const scan = drizzle(sqlite).select().from(legacyScan).where(eq(legacyScan.userId, userId)).get();
  if (!scan) return true;
  return scan.unresolvedCount > 0 && (JSON.parse(scan.cutoffExposureKeysJson) as string[]).includes(exposureKey);
}

export function completedAtForSession(sqlite: Database.Database, userId: string, id: string): string | null {
  return drizzle(sqlite).select().from(completionEvents).where(ownedEvent(userId, id)).get()?.completedAt ?? null;
}
export function completedAtForSessions(sqlite: Database.Database, userId: string): Map<string, string | null> {
  return new Map(drizzle(sqlite).select().from(completionEvents).where(eq(completionEvents.userId, userId)).all().map(e => [e.attemptId, e.completedAt]));
}

/** Caller persists on this same connection. IMMEDIATE serializes family claims
 * across connections, while the per-session lock still protects Deep actions.
 * This function is synchronous: no model request can live inside the transaction. */
export function commitPracticeCheckpoint(sqlite: Database.Database, userId: string, state: SessionState,
  event: PracticeCheckpoint, persist: (state: SessionState) => void, now = new Date().toISOString()) {
  sqlite.transaction(() => {
    const db = drizzle(sqlite);
    const row = db.select().from(writingSessions).where(ownedAttempt(userId, state.id)).get();
    if (!row) throw new Error("Practice no longer exists");
    const stored = readSession(row.stateJson);
    const resolved = recordAttempt(sqlite, userId, state, questionContext(sqlite));
    const familyKey = and(eq(familiarity.userId, userId), eq(familiarity.exposureKey, resolved.exposureKey ?? ""));
    const facts = resolved.exposureKey ? db.select().from(familiarity).where(familyKey).get() : undefined;
    if (event === "acceptOriginal") {
      // Even if startup scanning failed, regrading an old finished record must
      // never mint current-week credit. This is the same legacy fact as scan.
      if (stored.stage === "finished" && !stored.originalSubmittedAt) db.insert(completionEvents).values({
        userId, attemptId: state.id, activity: state.activity, exposureKey: resolved.exposureKey,
        questionId: resolved.questionId, primaryTopic: resolved.primaryTopic, questionType: resolved.questionType,
        completedAt: null, originalSubmittedAt: null, freshness: "unknown", relation: completionRelation(state), legacy: true,
      }).onConflictDoNothing().run();
      // An old accepted original has no trustworthy timestamp. Retry must not
      // turn it into a new submission, even after its JSON was upgraded to v2.
      if (stored.submitted.original !== null || (stored.evaluation && !stored.originalSubmittedAt)) {
        state.originalSubmittedAt = stored.originalSubmittedAt;
        state.originalFreshness = stored.originalFreshness;
        // Retrying an old accepted original is itself positive evidence, even
        // if startup could not finish the user's full historical scan.
        if (facts && facts.deepOriginalSubmitted === "none") db.update(familiarity).set({
          deepOriginalSubmitted: stored.originalSubmittedAt ? "known" : "unknown_time",
          firstDeepOriginalAt: stored.originalSubmittedAt,
        }).where(familyKey).run();
      } else {
        state.originalFreshness = originalFreshness({ rewrite: Boolean(state.rewriteOfDeepId),
          submitted: facts?.deepOriginalSubmitted ?? "none", feedback: facts?.priorFeedback ?? "none",
          exposureUnknown: !resolved.exposureKey || isExposureUnknown(sqlite, userId, resolved.exposureKey) });
        state.originalSubmittedAt = now;
        if (facts) db.update(familiarity).set({
          deepOriginalSubmitted: facts.deepOriginalSubmitted === "unknown_time" ? "unknown_time" : "known",
          firstDeepOriginalAt: facts.deepOriginalSubmitted === "none" ? now : facts.firstDeepOriginalAt,
          freshAttemptId: state.originalFreshness === "fresh" ? state.id : facts.freshAttemptId,
        }).where(familyKey).run();
      }
    } else {
      if (!state.evaluation || state.stage !== "feedback") throw new Error("Required original feedback is missing");
      // Submission facts are immutable and come from the previously committed snapshot.
      state.originalSubmittedAt = stored.originalSubmittedAt;
      state.originalFreshness = stored.originalFreshness;
      const existing = db.select().from(completionEvents).where(ownedEvent(userId, state.id)).get();
      if (existing) state.feedbackUpdatedAt = now;
      else db.insert(completionEvents).values({ userId, attemptId: state.id, activity: state.activity,
        exposureKey: resolved.exposureKey, questionId: resolved.questionId, primaryTopic: resolved.primaryTopic,
        questionType: resolved.questionType, completedAt: now, originalSubmittedAt: state.originalSubmittedAt,
        freshness: state.originalFreshness ?? "unknown", relation: completionRelation(state), legacy: false }).run();
      if (facts) db.update(familiarity).set({ priorFeedback: facts.priorFeedback === "unknown_time" ? "unknown_time" : "known" }).where(familyKey).run();
    }
    if (state.checkpointId) {
      const key = and(eq(checkpoints.userId,userId),eq(checkpoints.attemptId,state.id));
      const cp = db.select().from(checkpoints).where(key).get();
      if(cp && (cp.status === "in_progress" || (cp.status === "ineligible" && !cp.completedAt))) {
        const submittedAt = cp.submittedAt ?? state.originalSubmittedAt;
        const external = db.select().from(familiarity).where(and(eq(familiarity.userId,userId),eq(familiarity.exposureKey,cp.exposureKey))).get()?.externalPractice;
        const reason = external === "yes" || external === "unsure" ? "外部练习声明不符合资格" : !cp.startQualified || cp.declaration !== "no" ? "开始时资格不符" : !submittedAt || submittedAt > cp.deadlineAt ? "超过 40 分钟提交" : state.mode !== "mock" || state.cardSnapshot || state.continuedFromQuickId || state.prewriteTurns > 0 || state.outline.userEdited || state.messages.some(m => m.role === "coach" && ["prewriting", "writing"].includes(m.stage)) || Object.keys(state.suggestions).length > 0 ? "原稿接受前使用了辅导" : null;
        if(event === "acceptOriginal") db.update(checkpoints).set({submittedAt,...(reason ? {status:"ineligible" as const,reason} : {})}).where(key).run();
        else {
          const baseline = db.select().from(checkpoints).where(and(eq(checkpoints.userId,userId),eq(checkpoints.isBaseline,true))).get();
          db.update(checkpoints).set({submittedAt,completedAt:now,status:reason ? "ineligible" : "eligible",reason,isBaseline:!reason && !baseline}).where(key).run();
        }
      }
    }
    state.completedAt = completedAtForSession(sqlite, userId, state.id);
    persist(state);
  }).immediate();
}

export function completionRelation(state: SessionState): "rewrite" | "continuation" | "none" {
  return state.rewriteOfDeepId ? "rewrite" : state.continuedFromQuickId ? "continuation" : "none";
}

/** WP2c calls this in its deletion transaction, before removing content. */
export function markPracticeDeleted(sqlite: Database.Database, userId: string, id: string, now: string) {
  sqlite.transaction(() => {
    const db = drizzle(sqlite);
    const marker = db.select().from(attemptMarkers).where(and(eq(attemptMarkers.userId, userId), eq(attemptMarkers.attemptId, id))).get();
    if (marker && !marker.deletedAt) db.update(attemptMarkers).set({ deletedAt: now }).where(and(eq(attemptMarkers.userId, userId), eq(attemptMarkers.attemptId, id))).run();
    db.update(checkpoints).set({evidenceDeleted:true}).where(and(eq(checkpoints.userId,userId),eq(checkpoints.attemptId,id))).run();
    db.update(checkpoints).set({status:"abandoned",reason:"练习已删除"}).where(and(eq(checkpoints.userId,userId),eq(checkpoints.attemptId,id),eq(checkpoints.status,"in_progress"))).run();
    db.update(completionEvents).set({ evidenceDeleted: true }).where(ownedEvent(userId, id)).run();
  })();
}
