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
import { getSession, saveSession } from "../lib/db/queries/sessions";
import { createSession } from "../lib/pipeline/initial";

// This script never reads or mutates the configured application database.
const directory = mkdtempSync(join(tmpdir(), "opc-db-regression-"));
// Empty SQLite file: no startup baseline, every table must come from migrations.
const empty = new Database(join(directory, "empty.db"));
try {
  empty.pragma("foreign_keys = ON");
  migrate(drizzle(empty), { migrationsFolder: resolve("drizzle") });
  migrate(drizzle(empty), { migrationsFolder: resolve("drizzle") });
  for (const table of ["users", "auth_sessions", "writing_sessions", "auth_attempts", "questions", "question_aliases", "question_alias_candidates"]) {
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
  migrate(db, { migrationsFolder: resolve("drizzle") });
  migrate(db, { migrationsFolder: resolve("drizzle") });
  assert.deepEqual(db.$client.prepare("SELECT * FROM writing_sessions").all(), originalRows);
  assert.deepEqual(db.$client.prepare("SELECT * FROM users").all(), originalUsers);
  assert.deepEqual(db.$client.prepare("SELECT * FROM auth_sessions").all(), originalAuth);
  for (const table of ["questions", "question_aliases", "question_alias_candidates"]) {
    assert.ok(db.$client.prepare("SELECT name FROM sqlite_master WHERE name = ?").get(table), table);
  }
  assert.equal((db.$client.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as { n: number }).n, journal.entries.length);
  console.log("PASS: existing baseline database upgrades, preserving users, auth and session JSON byte-for-byte.");
  assert.equal(getSession("another-user", state.id), null);
  db.delete(users).where(eq(users.id, "owner")).run();
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
