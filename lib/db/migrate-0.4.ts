import type Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, asc, eq } from "drizzle-orm";
import { users, writingSessions, legacyScan, familiarity, completionEvents, attemptMarkers } from "./schema";
import { questionContext } from "./question-context";
import { recordAttempt, completionRelation } from "./practice-facts";
import { readSession } from "../pipeline/read-session";
import { aliasVersion } from "../question-bank/aliases";

function cutoff(sqlite: Database.Database) {
  const context = questionContext(sqlite);
  // Opaque metadata, not an ordered version comparison. A release can contain
  // questions first introduced in several catalogs; retain all those labels.
  return { context, cutoffBankVersion: [...new Set(context.questions.map(q => q.bankVersion))].sort().join(","),
    cutoffExposureKeysJson: JSON.stringify([...new Set(context.questions.map(q => q.exposureKey))].sort()) };
}

/** Registration calls this in the same transaction as inserting the user. */
export function markNewUserScanned(sqlite: Database.Database, userId: string, now: string) {
  const { cutoffBankVersion, cutoffExposureKeysJson } = cutoff(sqlite);
  drizzle(sqlite).insert(legacyScan).values({ userId, cutoffBankVersion, cutoffExposureKeysJson,
    aliasVersion, unresolvedCount: 0, scannedAt: now }).onConflictDoNothing().run();
}

/** No session writes. Explicit rescan after reviewed alias changes preserves the
 * original cutoff and all positive facts; normal startup skips scanned users. */
export function scanLegacyUser(sqlite: Database.Database, userId: string, options: { rescan?: boolean; aliasVersion?: string; now?: string } = {}) {
  return sqlite.transaction(() => {
    const db = drizzle(sqlite);
    const existing = db.select().from(legacyScan).where(eq(legacyScan.userId, userId)).get();
    if (existing && !options.rescan) return existing;
    const snapshot = cutoff(sqlite);
    const context = options.aliasVersion ? questionContext(sqlite, options.aliasVersion) : snapshot.context;
    const rows = db.select().from(writingSessions).where(eq(writingSessions.userId, userId)).orderBy(asc(writingSessions.createdAt), asc(writingSessions.id)).all();
    if (rows.length && (!context.questions.length || !context.aliases.length)) throw new Error("Import the catalog and reviewed aliases before scanning existing history");
    let unresolvedCount = 0;
    for (const row of rows) {
      const state = readSession(row.stateJson);
      const resolved = recordAttempt(sqlite, userId, state, context);
      if (["ambiguous", "unmatched"].includes(resolved.resolution.result)) unresolvedCount++;
      if (resolved.exposureKey && state.activity === "deep") {
        const key = and(eq(familiarity.userId, userId), eq(familiarity.exposureKey, resolved.exposureKey));
        const facts = db.select().from(familiarity).where(key).get()!;
        const hasOriginal = Boolean(state.submitted?.original || state.evaluation);
        const historical = !state.originalSubmittedAt;
        db.update(familiarity).set({
          deepOriginalSubmitted: hasOriginal && historical ? "unknown_time" : facts.deepOriginalSubmitted,
          firstDeepOriginalAt: hasOriginal && historical ? null : facts.firstDeepOriginalAt,
          priorFeedback: state.evaluation && historical ? "unknown_time" : facts.priorFeedback,
        }).where(key).run();
      }
      if (state.stage === "finished") db.insert(completionEvents).values({ userId, attemptId: state.id,
        activity: state.activity, exposureKey: resolved.exposureKey, questionId: resolved.questionId,
        primaryTopic: resolved.primaryTopic, questionType: resolved.questionType, completedAt: null,
        originalSubmittedAt: state.originalSubmittedAt, freshness: state.originalFreshness ?? "unknown",
        relation: completionRelation(state), legacy: true }).onConflictDoNothing().run();
    }
    // Deleted unresolved text cannot become known merely because it disappeared.
    const survivingIds = new Set(rows.map(row => row.id));
    unresolvedCount += db.select().from(attemptMarkers).where(eq(attemptMarkers.userId, userId)).all()
      .filter(marker => !survivingIds.has(marker.attemptId) && ["ambiguous", "unmatched"].includes(marker.resolution)).length;
    const result = { userId, cutoffBankVersion: existing?.cutoffBankVersion ?? snapshot.cutoffBankVersion,
      cutoffExposureKeysJson: existing?.cutoffExposureKeysJson ?? snapshot.cutoffExposureKeysJson,
      aliasVersion: context.aliasVersion, unresolvedCount, scannedAt: options.now ?? new Date().toISOString() };
    db.insert(legacyScan).values(result).onConflictDoUpdate({ target: legacyScan.userId, set: result }).run();
    return result;
  }).immediate();
}

export function scanUnscannedUsers(sqlite: Database.Database, log: (message: string, error: unknown) => void = console.error) {
  const db = drizzle(sqlite);
  const scanned = new Set(db.select().from(legacyScan).all().map(s => s.userId));
  let succeeded = 0, failed = 0;
  for (const user of db.select({ id: users.id }).from(users).all()) {
    if (scanned.has(user.id)) continue;
    try { scanLegacyUser(sqlite, user.id); succeeded++; }
    catch (error) { failed++; log(`0.4 migration scan failed for user ${user.id}; exposure remains unknown`, error); }
  }
  return { succeeded, failed };
}
