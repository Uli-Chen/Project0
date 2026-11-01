import type Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import { topicCards, quickCheckResults, quickOperations, quickOperationInputs, quickPackages } from "../../lib/db/schema";

/** Fixtures only: WP4a production code must not write the four operation/check tables. */
export function seedQuickEvidence(sqlite: Database.Database, userId: string, attemptId: string, now: string) {
  const db = drizzle(sqlite), suffix = crypto.randomUUID();
  let card = db.select().from(topicCards).where(and(eq(topicCards.userId, userId), eq(topicCards.attemptId, attemptId))).get();
  if (!card) card = db.insert(topicCards).values({ id: `card-${suffix}`, userId, attemptId, questionId: "qb_mock_health_001", questionVersion: 1,
    contentVersion: 0, contentJson: '{"layout":"problem_solution","parts":[]}', state: "draft", createdAt: now, updatedAt: now }).returning().get();
  db.insert(quickPackages).values({ id: `pkg-${suffix}`, userId, attemptId, cardId: card.id, kind: "initial", grantedAt: now, limitsJson: '{}', usedJson: '{}' }).run();
  db.insert(quickOperations).values({ id: `op-${suffix}`, userId, attemptId, cardId: card.id, cardVersion: 0, kind: "check", slot: "check:v0", packageId: `pkg-${suffix}`, status: "ok", startedAt: now, finishedAt: now }).run();
  db.insert(quickOperationInputs).values({ operationId: `op-${suffix}`, userId, attemptId, inputJson: '{"text":"private frozen input"}' }).run();
  db.insert(quickCheckResults).values({ checkId: `op-${suffix}`, userId, attemptId, cardVersion: 0, outcome: "passed", resultsJson: '[{"note":"private check result"}]', createdAt: now }).run();
}
