import "server-only";
import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { getDb } from "./client";

type Scope = "session" | "review" | "model" | "quick-operation" | "llm-call";
const LEASE_MS = 90_000;
const HEARTBEAT_MS = 15_000;

export function isExecutionActive(scope: Scope, key: string, sqlite = getDb().$client): boolean {
  return Boolean(sqlite.prepare("SELECT 1 FROM execution_leases WHERE scope = ? AND key = ? AND expires_at > ?").get(scope, key, Date.now()));
}

export function pruneExpiredExecutions(scope: Scope, now = Date.now(), sqlite = getDb().$client) {
  sqlite.prepare("DELETE FROM execution_leases WHERE scope = ? AND expires_at <= ?").run(scope, now);
}

export function acquireExecution(scope: Scope, key: string, sqlite: Database.Database = getDb().$client, lifetimeMs = LEASE_MS) {
  const token = randomUUID(), now = Date.now();
  const claimed = sqlite.prepare(`INSERT INTO execution_leases(scope, key, token, expires_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(scope, key) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at
    WHERE execution_leases.expires_at <= ?`).run(scope, key, token, now + lifetimeMs, now);
  if (!claimed.changes) return null;

  let heartbeat: ReturnType<typeof setInterval> | undefined;
  return {
    current() {
      return Boolean(sqlite.prepare("SELECT 1 FROM execution_leases WHERE scope = ? AND key = ? AND token = ? AND expires_at > ?").get(scope, key, token, Date.now()));
    },
    keepAlive() {
      heartbeat ??= setInterval(() => {
        try {
          const now = Date.now();
          const renewed = sqlite.prepare("UPDATE execution_leases SET expires_at = ? WHERE scope = ? AND key = ? AND token = ? AND expires_at > ?")
            .run(now + lifetimeMs, scope, key, token, now);
          if (!renewed.changes) clearInterval(heartbeat);
        } catch { console.error("Execution lease renewal failed"); }
      }, HEARTBEAT_MS).unref();
    },
    release() {
      clearInterval(heartbeat);
      try {
        sqlite.prepare("DELETE FROM execution_leases WHERE scope = ? AND key = ? AND token = ?").run(scope, key, token);
      } catch { console.error("Execution lease release failed"); }
    },
  };
}

export type ExecutionLease = NonNullable<ReturnType<typeof acquireExecution>>;
