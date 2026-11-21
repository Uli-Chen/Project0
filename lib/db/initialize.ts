import type Database from "better-sqlite3";

// Keep startup idempotent: a fresh installation works without a separate CLI step.
// The same tables are described in schema.ts for Drizzle migration generation.
export function initializeSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      profile_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email);
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);
    CREATE TABLE IF NOT EXISTS writing_sessions (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      state_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, id)
    );
    CREATE INDEX IF NOT EXISTS writing_sessions_user_updated_idx ON writing_sessions(user_id, updated_at);
    CREATE TABLE IF NOT EXISTS execution_leases (
      scope TEXT NOT NULL,
      key TEXT NOT NULL,
      token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      PRIMARY KEY(scope, key)
    );
    CREATE INDEX IF NOT EXISTS execution_leases_scope_expiry_idx ON execution_leases(scope, expires_at);
    CREATE TABLE IF NOT EXISTS auth_attempts (
      key TEXT PRIMARY KEY NOT NULL,
      count INTEGER NOT NULL,
      resets_at INTEGER NOT NULL
    );
  `);
}
