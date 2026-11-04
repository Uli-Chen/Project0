import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { z } from "zod";
import { getDb } from "../lib/db/client";
import { generateJson } from "../lib/llm/client";
import { reserveCall } from "../lib/llm/calls";

const directory = mkdtempSync(join(tmpdir(), "opc-coach-network-"));
process.env.DATABASE_PATH = join(directory, "test.db");
const db = getDb(), sqlite = db.$client;
migrate(db, { migrationsFolder: resolve("drizzle") });
const originalFetch = globalThis.fetch, originalKey = process.env.LLM_API_KEY;
const schema = z.object({ reply: z.string() });
const options = { purpose: "writing_chat" as const, callSite: "deep.chat" as const, coachV2: true, userId: "retry-user" };
const response = (content = '{"reply":"answer"}') => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content } }], usage: { prompt_tokens: 12, completion_tokens: 3 } }));
const networkError = (code = "ECONNRESET") => new TypeError("fetch failed", { cause: Object.assign(new Error("transport failure"), { code }) });
const rows = () => sqlite.prepare("SELECT outcome, attempt, input_tokens, output_tokens, prompt_version FROM llm_calls ORDER BY rowid").all() as { outcome: string; attempt: number; input_tokens: number | null; output_tokens: number | null; prompt_version: string }[];
beforeEach(() => {
  sqlite.exec("DELETE FROM users");
  sqlite.prepare("INSERT INTO users(id,email,name,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)").run("retry-user", "retry@test.invalid", "Test", "fake", "2026-11-01T12:00:00.000Z", "2026-11-01T12:00:00.000Z");
  process.env.LLM_API_KEY = "offline-test-only";
  globalThis.fetch = async () => { assert.fail("No real fetch allowed"); };
});
after(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = originalKey;
  sqlite.close(); rmSync(directory, { recursive: true, force: true });
});

test("v2 allowlisted transport failures retry identical bytes once and retain unknown usage", async () => {
  for (const code of ["ECONNRESET", "EPIPE", "UND_ERR_SOCKET", "EAI_AGAIN", "ETIMEDOUT"]) {
    const bodies: string[] = [];
    globalThis.fetch = async (_url, init) => { bodies.push(String(init?.body)); if (bodies.length === 1) throw networkError(code); return response(); };
    assert.deepEqual(await generateJson("instruction", { student: "my idea" }, schema, options), { reply: "answer" });
    assert.equal(bodies.length, 2); assert.equal(bodies[0], bodies[1]);
    const calls = rows().slice(-2);
    assert.deepEqual(calls.map(row => [row.outcome, row.attempt, row.input_tokens, row.output_tokens]), [["indeterminate", 1, null, null], ["ok", 2, 12, 3]]);
    assert.equal(calls[0].prompt_version, calls[1].prompt_version);
    assert.equal(calls[1].prompt_version.includes("system/retry"), false);
  }
});

test("v2 body interruption with known transport cause retries without a format hint", async () => {
  const bodies: string[] = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(String(init?.body));
    return bodies.length === 1 ? new Response(new ReadableStream({ start(controller) { controller.error(networkError("UND_ERR_SOCKET")); } })) : response();
  };
  await generateJson("instruction", {}, schema, options);
  assert.equal(bodies.length, 2); assert.equal(bodies[0], bodies[1]);
  assert.deepEqual(rows().map(row => row.outcome), ["indeterminate", "ok"]);
});

test("v2 format and network failures share two total attempts even when retries=9", async () => {
  for (const order of ["network-format", "format-network", "network-network", "format-format"]) {
    const failures = order.split("-");
    const bodies: string[] = [];
    globalThis.fetch = async (_url, init) => {
      bodies.push(String(init?.body));
      if (failures[bodies.length - 1] === "network") throw networkError();
      return response("{");
    };
    await assert.rejects(generateJson("instruction", {}, schema, { ...options, retries: 9 }));
    assert.equal(bodies.length, 2);
    assert.equal(bodies[1].includes("Previous response was invalid"), failures[0] === "format");
    assert.equal(rows().at(-1)?.prompt_version.includes("system/retry"), failures[0] === "format");
  }
});

test("unknown, permanent and provider failures are never retried", async () => {
  for (const error of [new TypeError("fetch failed"), networkError("ENOTFOUND"), networkError("CERT_HAS_EXPIRED"), new DOMException("aborted", "AbortError"), new Error("application error")]) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw error; };
    await assert.rejects(generateJson("instruction", {}, schema, options));
    assert.equal(calls, 1);
  }
  for (const status of [401, 403, 429, 503]) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response("{}", { status }); };
    await assert.rejects(generateJson("instruction", {}, schema, options));
    assert.equal(calls, 1);
  }
});

test("legacy, retries=0 and reservation requests never gain network retries", async () => {
  for (const override of [{ coachV2: false }, { retries: 0 }]) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw networkError(); };
    await assert.rejects(generateJson("instruction", {}, schema, { ...options, ...override }));
    assert.equal(calls, 1);
  }
  // Reserved calls are Quick requests and use the legacy builder in production.
  // Keep its real input ceiling; tutor instructions do not fit that budget.
  const reserved = reserveCall({ userId: "retry-user", sessionId: "s", operationId: "op", packageId: "p", purpose: "quick_check", perCall: { inputTokens: 4000, maxOutputTokens: 768 }, packageLimits: { calls: 2, inputTokens: 24000, outputTokens: 1536, waitMs: 25000 }, now: "2026-11-01T12:00:00.000Z" });
  assert.ok(reserved.ok);
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw networkError(); };
  await assert.rejects(generateJson("instruction", {}, schema, { ...options, coachV2: false, purpose: "quick_check", reservation: reserved.reservation, sessionId: "s", operationId: "op", retries: 9 }));
  assert.equal(calls, 1); assert.equal(rows().at(-1)?.outcome, "indeterminate");
});

test("network retry uses remaining total timeout and skips insufficient time", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  const timeouts: number[] = [];
  t.mock.method(AbortSignal, "timeout", (ms: number) => { timeouts.push(ms); return new AbortController().signal; });
  let calls = 0;
  globalThis.fetch = async () => { calls++; if (calls === 1) { t.mock.timers.tick(1000); throw networkError(); } return response(); };
  await generateJson("instruction", {}, schema, { ...options, timeoutMs: 2500 });
  assert.equal(calls, 2); assert.deepEqual(timeouts, [2500, 1500]);
  for (const [timeoutMs, elapsed] of [[2000, 1001], [120000, 70000]]) {
    calls = 0;
    globalThis.fetch = async () => { calls++; t.mock.timers.tick(elapsed); throw networkError(); };
    await assert.rejects(generateJson("instruction", {}, schema, { ...options, timeoutMs }));
    assert.equal(calls, 1);
  }
});

test("local deadline abort is not retried even with an allowlisted transport cause", async t => {
  const controller = new AbortController();
  t.mock.method(AbortSignal, "timeout", () => controller.signal);
  let calls = 0;
  globalThis.fetch = async () => { calls++; controller.abort(); throw networkError("ETIMEDOUT"); };
  await assert.rejects(generateJson("instruction", {}, schema, options), /超时/);
  assert.equal(calls, 1); assert.equal(rows()[0].outcome, "timeout");
});
