import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { z } from "zod";
import { getDb } from "../lib/db/client";
import { markNewUserScanned } from "../lib/db/migrate-0.4";
import { saveSession, deleteSession } from "../lib/db/queries/sessions";
import { createSession } from "../lib/pipeline/initial";
import { reserveCall, type ReserveCallInput } from "../lib/llm/calls";
import { buildMessages, estimateInputTokens, generateJson } from "../lib/llm/client";
import { quickBudget } from "../lib/llm/budget";
import { occupiedBudget, type CallAccounting } from "../lib/rules/llm-budget";
import { register } from "../instrumentation";

async function main() {
// No configured application database is read; all state lives in this temp dir.
const directory = mkdtempSync(join(tmpdir(), "opc-wp3-e2e-"));
process.env.DATABASE_PATH = join(directory, "e2e.db");
const originalFetch = globalThis.fetch, originalKey = process.env.LLM_API_KEY, originalError = console.error;
let fetches = 0;
const logs: string[] = [], evidence: Record<string, unknown> = {};
const secret = "WP3_UNIQUE_PRIVATE_INSTRUCTION_CONTEXT_OUTPUT_9e72";
globalThis.fetch = async () => { fetches++; return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ reply: secret }) } }], usage: { prompt_tokens: 80, completion_tokens: 12 } })); };
// Set a fake credential only AFTER replacing fetch. Never call a real provider.
process.env.LLM_API_KEY = "offline-test-only";
const db = getDb(), sqlite = db.$client;
const now = "2026-11-01T12:00:00.000Z", schema = z.object({ reply: z.string() });
const snapshot = () => sqlite.prepare("SELECT * FROM llm_calls ORDER BY rowid").all() as CallAccounting[];
try {
  migrate(db, { migrationsFolder: resolve("drizzle") });
  sqlite.prepare("INSERT INTO users(id,email,name,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)").run("e2e", "e2e@test.invalid", "Test", "fake", now, now);
  markNewUserScanned(sqlite, "e2e", now);
  const session = createSession({ kind: "free", mode: "practice" }); session.activity = "quick"; session.stage = "quick"; saveSession("e2e", session);
  const input: ReserveCallInput = { userId: "e2e", sessionId: session.id, operationId: "check-v1", packageId: "initial", purpose: "quick_check", perCall: { inputTokens: estimateInputTokens(buildMessages(secret, { text: secret }, schema)), maxOutputTokens: 768 }, packageLimits: quickBudget.initial.limits, now };
  const first = reserveCall(input); assert.ok(first.ok);
  evidence.reserved = snapshot();
  const reply = await generateJson(secret, { text: secret }, schema, { purpose: "quick_check", userId: "e2e", sessionId: session.id, reservation: first.reservation });
  assert.equal(reply.reply, secret); assert.equal(fetches, 1); assert.equal(snapshot()[0].outcome, "ok");
  evidence.settled = snapshot(); evidence.actualOccupied = occupiedBudget(snapshot());
  const abandoned = reserveCall({ ...input, operationId: "check-v2" }); assert.ok(abandoned.ok);
  // Exercise the actual Next startup entry point; a failed recovery logs once
  // and does not prevent startup. Retrying startup recovers without any fetch.
  process.env.NEXT_RUNTIME = "nodejs";
  console.error = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  sqlite.exec("CREATE TRIGGER fail_recovery BEFORE UPDATE ON llm_calls BEGIN SELECT RAISE(ABORT, 'recovery failed'); END");
  await register(); assert.equal(snapshot()[1].outcome, "reserved");
  assert.ok(logs.includes("llm_calls startup recovery failed; reservations retained"));
  sqlite.exec("DROP TRIGGER fail_recovery");
  await register(); assert.equal(snapshot()[1].outcome, "indeterminate"); assert.equal(fetches, 1);
  evidence.recovered = snapshot(); evidence.recoveryLogs = logs;
  const beforeDelete = snapshot(); deleteSession("e2e", session.id);
  assert.deepEqual(snapshot(), beforeDelete); assert.equal(sqlite.prepare("SELECT * FROM writing_sessions").all().length, 0);
  evidence.afterPracticeDelete = snapshot(); evidence.retainedOccupied = occupiedBudget(snapshot());
  assert.ok(!JSON.stringify(snapshot()).includes(secret));
  sqlite.prepare("DELETE FROM users WHERE id = 'e2e'").run(); assert.equal(snapshot().length, 0);
  evidence.afterAccountDelete = snapshot(); evidence.fakeFetchCount = fetches;
  evidence.integrity = sqlite.pragma("integrity_check", { simple: true });
  assert.equal(evidence.integrity, "ok");
  const output = resolve("docs/plans/reports/WP3_e2e"); mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "ledger-evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
  console.log("PASS: temp SQLite full migrations → reserve → fake provider → settle actual usage.");
  console.log("PASS: startup recovery failure is nonfatal; next startup marks inflight indeterminate without redispatch.");
  console.log("PASS: deleting practice retains quota ledger; deleting account cascades it; no private body in any column.");
  console.log("PASS: integrity_check=ok; fake fetch count=1; evidence=docs/plans/reports/WP3_e2e/ledger-evidence.json");
} finally {
  globalThis.fetch = originalFetch; process.env.LLM_API_KEY = originalKey ?? ""; console.error = originalError;
  sqlite.close(); rmSync(directory, { recursive: true, force: true });
}

}
main().catch(error => { console.error(error); process.exitCode = 1; });
