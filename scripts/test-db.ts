import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { AuthError } from "../lib/auth/http";
import { getDb } from "../lib/db/client";
import { authSessions, users, writingSessions } from "../lib/db/schema";
import { deleteSession, getSession, saveSession } from "../lib/db/queries/sessions";
import { commitPracticeCheckpoint } from "../lib/db/practice-facts";
import { markNewUserScanned } from "../lib/db/migrate-0.4";
import { writeRequestReceipt } from "../lib/db/request-receipts";
import { importQuestions } from "../lib/db/import-questions";
import { createSession } from "../lib/pipeline/initial";
import { reserveCall } from "../lib/llm/calls";
import { quickBudget } from "../lib/llm/budget";

// This script never reads or mutates the configured application database.
const retainedTables = ["attempt_markers", "completion_events", "familiarity", "legacy_scan", "default_continuations", "request_receipts", "llm_calls"];
const directory = mkdtempSync(join(tmpdir(), "opc-db-regression-"));
// Empty SQLite file: no startup baseline, every table must come from migrations.
const empty = new Database(join(directory, "empty.db"));
try {
  empty.pragma("foreign_keys = ON");
  migrate(drizzle(empty), { migrationsFolder: resolve("drizzle") });
  migrate(drizzle(empty), { migrationsFolder: resolve("drizzle") });
  for (const table of ["users", "auth_sessions", "writing_sessions", "auth_attempts", "questions", "question_aliases", "question_alias_candidates", ...retainedTables]) {
    assert.ok(empty.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table), table);
  }
  assert.equal(empty.pragma("integrity_check", { simple: true }), "ok");
  console.log("PASS: empty database full migrations and migration replay.");
} finally { empty.close(); }

// Build an already-migrated baseline using a temporary migration directory.
const baselineFolder = join(directory, "baseline-migrations");
mkdirSync(join(baselineFolder, "meta"), { recursive: true });
const journal = JSON.parse(readFileSync(resolve("drizzle/meta/_journal.json"), "utf8"));
writeFileSync(join(baselineFolder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }));
copyFileSync(resolve(`drizzle/${journal.entries[0].tag}.sql`), join(baselineFolder, `${journal.entries[0].tag}.sql`));
process.env.DATABASE_PATH = join(directory, "test.db");
const db = getDb();
try {
  // Startup initializes the baseline. Applying the same migration twice must
  // preserve the schema, not create duplicate email indexes or lose data.
  migrate(db, { migrationsFolder: baselineFolder });
  assert.equal(db.$client.prepare("SELECT name FROM sqlite_master WHERE name = 'questions'").get(), undefined);
  const indexes = db.$client.prepare("PRAGMA index_list('users')").all() as Array<{ name: string }>;
  assert.equal(indexes.filter((index) => index.name.includes("email")).length, 1);
  assert.equal(db.$client.pragma("foreign_keys", { simple: true }), 1);
  const now = new Date().toISOString();
  db.insert(users).values({ id: "owner", name: "Test", email: "db-test@example.test", passwordHash: "test-only", createdAt: now, updatedAt: now }).run();
  db.insert(authSessions).values({ tokenHash: "test-session", userId: "owner", expiresAt: Date.now() + 60_000 }).run();
  const state = createSession({ kind: "free", mode: "mock" });
  saveSession("owner", state);
  const originalRows = db.$client.prepare("SELECT * FROM writing_sessions").all();
  const originalUsers = db.$client.prepare("SELECT * FROM users").all();
  const originalAuth = db.$client.prepare("SELECT * FROM auth_sessions").all();
  // Also exercise the actually shipped WP1 catalog schema before WP2b upgrade.
  writeFileSync(join(baselineFolder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, 2) }));
  copyFileSync(resolve(`drizzle/${journal.entries[1].tag}.sql`), join(baselineFolder, `${journal.entries[1].tag}.sql`));
  migrate(db, { migrationsFolder: baselineFolder });
  const catalog = JSON.parse(readFileSync(resolve("data/question-bank/question_bank.mock.json"), "utf8"));
  importQuestions(db.$client, catalog, JSON.parse(readFileSync(resolve("data/question-bank/requirements.mock.json"), "utf8")));
  const originalCatalog = db.$client.prepare("SELECT * FROM questions").all();
  // Upgrade the actually shipped WP2b/WP2c schema before adding WP3.
  writeFileSync(join(baselineFolder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, 3) }));
  copyFileSync(resolve(`drizzle/${journal.entries[2].tag}.sql`), join(baselineFolder, `${journal.entries[2].tag}.sql`));
  migrate(db, { migrationsFolder: baselineFolder });
  assert.equal(db.$client.prepare("SELECT name FROM sqlite_master WHERE name = 'llm_calls'").get(), undefined);
  db.$client.prepare("INSERT INTO default_continuations VALUES(?,?,?,?)").run("owner", "pre-upgrade-quick", "pre-upgrade-deep", now);
  const preUpgradeFacts = db.$client.prepare("SELECT * FROM default_continuations").all();
  migrate(db, { migrationsFolder: resolve("drizzle") });
  migrate(db, { migrationsFolder: resolve("drizzle") });
  assert.deepEqual(db.$client.prepare("SELECT * FROM questions").all(), originalCatalog);
  assert.deepEqual(db.$client.prepare("SELECT * FROM writing_sessions").all(), originalRows);
  assert.deepEqual(db.$client.prepare("SELECT * FROM users").all(), originalUsers);
  assert.deepEqual(db.$client.prepare("SELECT * FROM auth_sessions").all(), originalAuth);
  assert.deepEqual(db.$client.prepare("SELECT * FROM default_continuations").all(), preUpgradeFacts);
  db.$client.prepare("DELETE FROM default_continuations WHERE quick_attempt_id = 'pre-upgrade-quick'").run();
  for (const table of ["questions", "question_aliases", "question_alias_candidates", ...retainedTables]) {
    assert.ok(db.$client.prepare("SELECT name FROM sqlite_master WHERE name = ?").get(table), table);
  }
  assert.equal((db.$client.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as { n: number }).n, journal.entries.length);
  console.log("PASS: existing baseline database upgrades, preserving users, auth and session JSON byte-for-byte.");
  assert.equal(getSession("another-user", state.id), null);
  // Delete only content, keeping the metadata needed for history/familiarity.
  markNewUserScanned(db.$client, "owner", now);
  state.prompt = { ...state.prompt, id: "pasted-test", text: catalog.questions[0].text };
  saveSession("owner", state);
  state.submitted.original = "private essay text"; state.stage = "evaluating";
  commitPracticeCheckpoint(db.$client, "owner", state, "acceptOriginal", s => saveSession("owner", s), now);
  state.evaluation = { scores: { overall: 6, dims: { TR: 6, CC: 6, LR: 6, GRA: 6 }, rationale: { TR: "r", CC: "r", LR: "r", GRA: "r" } }, issues: [], review: { outlineCoverage: [], breakthrough: null, focusResult: null, selfReportContrast: null, aiRatio: 0 } };
  state.stage = "feedback";
  commitPracticeCheckpoint(db.$client, "owner", state, "completeOriginal", s => saveSession("owner", s), now);
  db.$client.prepare("INSERT INTO default_continuations VALUES(?,?,?,?)").run("owner", "source-quick", state.id, now);
  writeRequestReceipt(db.$client, { userId: "owner", idempotencyKey: "request", attemptId: state.id, action: "create", paramsHash: "hash", resultRef: state.id, createdAt: now });
  assert.equal(reserveCall({ userId: "owner", sessionId: state.id, operationId: "db-test-op", packageId: "db-test-pack", purpose: "quick_check", perCall: { inputTokens: 4000, maxOutputTokens: 768 }, packageLimits: quickBudget.initial.limits, now }, db.$client).ok, true);
  deleteSession("owner", state.id);
  assert.equal(db.select().from(writingSessions).all().length, 0, "正文会话随练习删除");
  for (const table of retainedTables) {
    const rows = db.$client.prepare(`SELECT * FROM ${table}`).all();
    assert.equal(rows.length, 1, table);
    assert.ok(!JSON.stringify(rows).includes("private essay text"));
    const foreignKeys = db.$client.prepare(`PRAGMA foreign_key_list(${table})`).all() as { table: string; on_delete: string }[];
    assert.deepEqual(foreignKeys.map(key => [key.table, key.on_delete]), [["users", "CASCADE"]]);
  }
  assert.ok((db.$client.prepare("SELECT deleted_at FROM attempt_markers").get() as { deleted_at: string }).deleted_at);
  assert.equal((db.$client.prepare("SELECT evidence_deleted FROM completion_events").get() as { evidence_deleted: number }).evidence_deleted, 1);
  console.log("PASS: WP2c upgrade preserves existing facts; deleting an attempt retains all seven metadata tables including llm_calls (users-only CASCADE).");
  db.delete(users).where(eq(users.id, "owner")).run();
  for (const table of retainedTables) assert.equal(db.$client.prepare(`SELECT * FROM ${table}`).all().length, 0, `${table} account cascade`);
  assert.equal(getSession("owner", state.id), null);
  assert.equal(db.select().from(authSessions).all().length, 0);
  // Simulate a model reply arriving after account deletion. It cannot recreate
  // the removed session, and the API receives an expected authentication error.
  assert.throws(() => saveSession("owner", state), (error) => error instanceof AuthError && error.status === 401);
  assert.equal(db.select().from(writingSessions).all().length, 0);
  // The database constraint remains a second guard even if a caller bypasses
  // the query helper, including from another SQLite connection.
  assert.throws(() => db.insert(writingSessions).values({ id: state.id, userId: "owner", stateJson: JSON.stringify(state), createdAt: now, updatedAt: now }).run());
  assert.equal(db.$client.pragma("integrity_check", { simple: true }), "ok");
  console.log("PASS: idempotent baseline/migrations, owner scoping, cascading deletion, stale model-save rejection, and foreign-key enforcement.");
} finally {
  db.$client.close();
  rmSync(directory, { recursive: true, force: true });
}
