import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { AuthError } from "../lib/auth/http";
import { getDb } from "../lib/db/client";
import { authSessions, users, writingSessions } from "../lib/db/schema";
import { getSession, saveSession } from "../lib/db/queries/sessions";
import { createSession } from "../lib/pipeline/initial";

// This script never reads or mutates the configured application database.
const directory = mkdtempSync(join(tmpdir(), "opc-db-regression-"));
process.env.DATABASE_PATH = join(directory, "test.db");
const db = getDb();
try {
  // Startup initializes the baseline. Applying the same migration twice must
  // preserve the schema, not create duplicate email indexes or lose data.
  migrate(db, { migrationsFolder: resolve("drizzle") });
  migrate(db, { migrationsFolder: resolve("drizzle") });
  const indexes = db.$client.prepare("PRAGMA index_list('users')").all() as Array<{ name: string }>;
  assert.equal(indexes.filter((index) => index.name.includes("email")).length, 1);
  assert.equal(db.$client.pragma("foreign_keys", { simple: true }), 1);
  const now = new Date().toISOString();
  db.insert(users).values({ id: "owner", name: "Test", email: "db-test@example.test", passwordHash: "test-only", createdAt: now, updatedAt: now }).run();
  db.insert(authSessions).values({ tokenHash: "test-session", userId: "owner", expiresAt: Date.now() + 60_000 }).run();
  const state = createSession({ kind: "free", mode: "mock" });
  saveSession("owner", state);
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
}
