import { inRequest } from "./request-context";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "../../lib/db/client";
import { authSessions, users } from "../../lib/db/schema";
import { importQuestions } from "../../lib/db/import-questions";
import { markNewUserScanned } from "../../lib/db/migrate-0.4";
import { getSession, saveSession } from "../../lib/db/queries/sessions";
import { POST as CREATE } from "../../app/api/sessions/route";
import { POST as ACTION } from "../../app/api/sessions/[id]/actions/route";
import { GET as QUICK } from "../../app/api/sessions/[id]/quick/route";
import { PATCH, DELETE } from "../../app/api/sessions/[id]/route";
import { DELETE as ACCOUNT } from "../../app/api/auth/account/route";
import { catalog, requirements, time, table } from "./practice-db";

export function quickFixture() {
  const directory = mkdtempSync(join(tmpdir(), "opc-quick-"));
  process.env.DATABASE_PATH = join(directory, "test.db");
  process.env.APP_ORIGIN = "http://quick.test";
  process.env.QUESTION_BANK_ENABLED = process.env.QUICK_ENABLED = "true";
  const db = getDb(); migrate(db, { migrationsFolder: resolve("drizzle") });
  importQuestions(db.$client, catalog, requirements);
  for (const id of ["u", "other"]) {
    db.insert(users).values({ id, email: `${id}@test.test`, name: id, passwordHash: "test", createdAt: time, updatedAt: time }).run();
    db.insert(authSessions).values({ tokenHash: createHash("sha256").update((id === "u" ? "a" : "b").repeat(64)).digest("hex"), userId: id, expiresAt: Date.now() + 86400000 * 365 }).run();
    markNewUserScanned(db.$client, id, time);
  }
  return { db, filename: process.env.DATABASE_PATH,
    async call(kind: "create" | "action" | "quick" | "patch" | "delete" | "account", id = "", body?: unknown, owner = "u", origin = "http://quick.test") {
      const method = kind === "quick" ? "GET" : kind === "patch" ? "PATCH" : kind === "delete" || kind === "account" ? "DELETE" : "POST";
      const request = new Request(`http://quick.test/api/sessions/${id}`, { method, headers: {
        origin, cookie: `wm_session=${(owner === "u" ? "a" : "b").repeat(64)}`, "content-type": "application/json",
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return inRequest(request, () => ({ create: CREATE, action: ACTION, quick: QUICK, patch: PATCH, delete: DELETE, account: ACCOUNT })[kind](request, { params: Promise.resolve({ id }) }));
    },
    followup(id: string) {
      const state = getSession("u", id)!;
      const message = { id: crypto.randomUUID(), role: "coach" as const, stage: "quick" as const, action: "quickFollowup" as const, content: "为什么会有这样的影响？" };
      state.messages.push(message); saveSession("u", state); return message;
    },
    snapshot() { return Object.fromEntries(["writing_sessions", "topic_cards", "quick_check_results", "quick_operations", "quick_operation_inputs", "quick_packages", "attempt_markers", "completion_events", "familiarity", "default_continuations", "request_receipts"].map(name => [name, table(db.$client, name)])); },
    close() { db.$client.close(); rmSync(directory, { recursive: true, force: true }); },
  };
}
