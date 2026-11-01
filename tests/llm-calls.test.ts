import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { fork } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { z } from "zod";
import { getDb } from "../lib/db/client";
import { buildMessages, estimateInputTokens, generateJson } from "../lib/llm/client";
import { reserveCall, settleCall, recoverInflightCalls, type Reservation, type ReserveCallInput, type ReserveCallResult } from "../lib/llm/calls";
import { callConfigVersion, quickBudget } from "../lib/llm/budget";
import { occupiedBudget, type CallAccounting } from "../lib/rules/llm-budget";

const directory = mkdtempSync(join(tmpdir(), "opc-wp3-calls-"));
process.env.DATABASE_PATH = join(directory, "test.db");
const db = getDb(), sqlite = db.$client;
migrate(db, { migrationsFolder: resolve("drizzle") });
const now = "2026-11-01T12:00:00.000Z", schema = z.object({ reply: z.string() });
const input: ReserveCallInput = { userId: "u", sessionId: "s", operationId: "op", packageId: "p", purpose: "quick_check", perCall: { inputTokens: 4000, maxOutputTokens: 768 }, packageLimits: quickBudget.initial.limits, now };
const originalFetch = globalThis.fetch, originalKey = process.env.LLM_API_KEY;
const rows = () => sqlite.prepare("SELECT * FROM llm_calls ORDER BY rowid").all() as (CallAccounting & { id: string; attempt: number; config_version: string })[];
const reserve = (overrides: Partial<ReserveCallInput> = {}): Reservation => {
  const result = reserveCall({ ...input, ...overrides });
  if (!result.ok) throw new Error(result.reason); return result.reservation;
};
const options = (reservation: Reservation) => ({ purpose: reservation.purpose, userId: "u", sessionId: "s", operationId: reservation.operationId, reservation });
const response = (usage: unknown = { prompt_tokens: 123, completion_tokens: 45 }, content = '{"reply":"answer"}', finish = "stop") => new Response(JSON.stringify({ choices: [{ finish_reason: finish, message: { content } }], ...(usage === null ? {} : { usage }) }));
beforeEach(() => {
  sqlite.exec("DROP TRIGGER IF EXISTS fail_settle; DROP TRIGGER IF EXISTS fail_reserve; DELETE FROM users");
  sqlite.prepare("INSERT INTO users(id,email,name,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)").run("u", "u@test.invalid", "Test", "fake", now, now);
  process.env.LLM_API_KEY = "offline-test-only";
  globalThis.fetch = async () => { assert.fail("No real fetch allowed"); };
});
after(() => { globalThis.fetch = originalFetch; process.env.LLM_API_KEY = originalKey ?? ""; sqlite.close(); rmSync(directory, { recursive: true, force: true }); });

test("成功：完整消息与估算一致，一行 ok 记录实际用量，额度按实际计", async () => {
  const messages = buildMessages("instruction", { text: "中文😀" }, schema);
  const estimate = estimateInputTokens(messages);
  assert.equal(estimate, Buffer.byteLength(JSON.stringify(messages), "utf8") + 320);
  assert.ok(estimateInputTokens(buildMessages("instruction", { text: "中文😀" }, schema, 1)) > estimate);
  const r = reserve({ perCall: { inputTokens: estimate, maxOutputTokens: 768 } });
  let called = 0;
  globalThis.fetch = async (_url, init) => {
    called++; assert.equal(sqlite.inTransaction, false);
    assert.equal(rows()[0].outcome, "reserved");
    const body = JSON.parse(init!.body as string); assert.deepEqual(body.messages, messages); assert.equal(body.max_tokens, 768);
    return response();
  };
  assert.deepEqual(await generateJson("instruction", { text: "中文😀" }, schema, options(r)), { reply: "answer" });
  assert.equal(called, 1); assert.equal(rows().length, 1); assert.equal(rows()[0].outcome, "ok");
  assert.equal(rows()[0].config_version, callConfigVersion);
  assert.equal(rows()[0].input_tokens, 123); assert.equal(rows()[0].output_tokens, 45);
  assert.equal(occupiedBudget(rows()).inputTokens, 123);
  assert.equal(reserveCall({ ...input, packageLimits: { calls: 2, inputTokens: 4123, outputTokens: 813, waitMs: 50000 } }).ok, true);
});
test("超时：延迟假 fetch 与可控时钟触发 timeout，预留时间仍占额度", async t => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.parse(now) });
  t.mock.method(AbortSignal, "timeout", (ms: number) => { const c = new AbortController(); setTimeout(() => c.abort(new DOMException("timeout", "TimeoutError")), ms); return c.signal; });
  const r = reserve({ packageLimits: { ...quickBudget.initial.limits, waitMs: 1700 } });
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => { init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason)); });
  const result = assert.rejects(generateJson("instruction", {}, schema, options(r)), /超时/);
  t.mock.timers.tick(1700); await result;
  assert.equal(rows()[0].outcome, "timeout"); assert.equal(rows()[0].latency_ms, 1700);
  assert.equal(occupiedBudget(rows()).waitMs, 1700); assert.equal(rows()[0].input_tokens, null);
});
test("不合格输出：带预留即使 retries=9 也不自动重试；显式重试重新预留并计 attempt", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return response(null, '{"reply":'); };
  await assert.rejects(generateJson("instruction", {}, schema, { ...options(reserve()), retries: 9 }));
  assert.equal(calls, 1); assert.equal(rows()[0].outcome, "invalid_output");
  const retry = reserve(); assert.equal(retry.attempt, 2);
  globalThis.fetch = async (_url, init) => { calls++; assert.match(JSON.parse(init!.body as string).messages[0].content, /Previous response/); return response(); };
  await generateJson("instruction", {}, schema, options(retry));
  assert.equal(calls, 2); assert.equal(rows().length, 2);
});
test("usage 未知或仅单项已知：NULL 不伪造 0，未知项按预留计", async () => {
  globalThis.fetch = async () => response(null);
  const r = reserve(); await generateJson("instruction", {}, schema, options(r));
  assert.equal(rows()[0].input_tokens, null); assert.equal(rows()[0].output_tokens, null);
  assert.equal(occupiedBudget(rows()).inputTokens, 4000); assert.equal(occupiedBudget(rows()).outputTokens, 768);
  globalThis.fetch = async () => response({ prompt_tokens: 0 });
  await generateJson("instruction", {}, schema, options(reserve()));
  assert.equal(rows()[1].input_tokens, 0); assert.equal(rows()[1].output_tokens, null);
});
test("核销写库失败：业务仍得到模型结果，原子更新不泄漏实际用量，预留完整保留", async t => {
  const logs: unknown[][] = []; t.mock.method(console, "error", (...args: unknown[]) => logs.push(args));
  const r = reserve(); const before = rows();
  sqlite.exec("CREATE TRIGGER fail_settle BEFORE UPDATE ON llm_calls BEGIN SELECT RAISE(ABORT, 'private database failure'); END");
  globalThis.fetch = async () => response();
  assert.deepEqual(await generateJson("instruction", {}, schema, options(r)), { reply: "answer" });
  assert.deepEqual(rows(), before); assert.equal(occupiedBudget(rows()).waitMs, 25000);
  assert.deepEqual(logs, [["llm_calls settlement failed; reservation retained"]]);
});
test("响应丢失：连接或响应体中断为 indeterminate，绝不自动重发", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new TypeError("socket disconnected"); };
  await assert.rejects(generateJson("instruction", {}, schema, options(reserve())));
  assert.equal(calls, 1); assert.equal(rows()[0].outcome, "indeterminate");
  globalThis.fetch = async () => { calls++; return new Response(new ReadableStream({ start(controller) { controller.error(new TypeError("body lost")); } })); };
  await assert.rejects(generateJson("instruction", {}, schema, options(reserve())));
  assert.equal(calls, 2); assert.equal(rows()[1].outcome, "indeterminate");
  assert.equal(occupiedBudget(rows()).waitMs, 50000);
});
test("启动恢复：reserved 变 indeterminate，用量和预留不变，晚到结果不能释放额度", async () => {
  const r = reserve(); const before = rows()[0];
  assert.equal(recoverInflightCalls(now), 1); assert.equal(recoverInflightCalls(now), 0);
  assert.deepEqual(rows()[0], { ...before, outcome: "indeterminate" });
  settleCall(r, { usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1, outcome: "ok" });
  assert.equal(rows()[0].outcome, "indeterminate"); assert.equal(occupiedBudget(rows()).inputTokens, 4000);
  await assert.rejects(generateJson("instruction", {}, schema, options(r)), /Reservation/);
});
test("预留写库失败抛错且 fake fetch 从未调用；外层 IMMEDIATE 回滚也不能 dispatch", async () => {
  let calls = 0; globalThis.fetch = async () => { calls++; return response(); };
  sqlite.exec("CREATE TRIGGER fail_reserve BEFORE INSERT ON llm_calls BEGIN SELECT RAISE(ABORT, 'write failure'); END");
  await assert.rejects(async () => { await generateJson("instruction", {}, schema, options(reserve())); }, /write failure/);
  assert.equal(calls, 0); assert.equal(rows().length, 0); sqlite.exec("DROP TRIGGER fail_reserve");
  let r: Reservation | undefined;
  assert.throws(() => sqlite.transaction(() => { r = reserve(); throw new Error("outer rollback"); }).immediate(), /outer rollback/);
  assert.equal(rows().length, 0); await assert.rejects(generateJson("instruction", {}, schema, options(r!)), /Reservation/); assert.equal(calls, 0);
});
test("输入超长不建行不调模型；预留后的完整消息若超估算也拒绝", async () => {
  assert.deepEqual(reserveCall({ ...input, perCall: { ...input.perCall, inputTokens: 4001 } }), { ok: false, reason: "input_too_long", retryAt: null });
  assert.equal(rows().length, 0);
  await assert.rejects(generateJson("instruction", { huge: "独特正文".repeat(1000) }, schema, options(reserve())), /input_too_long/);
  await assert.rejects(generateJson("instruction", {}, schema, { purpose: "scoring", userId: "u", maxInputTokens: 1 }), /input_too_long/);
});
test("日志全表任何列均不含独特提示词、上下文、模型输出正文", async () => {
  const secret = "UNIQUE_PRIVATE_正文_8dd84a2";
  globalThis.fetch = async () => response(null, JSON.stringify({ reply: secret }));
  await generateJson(secret, { text: secret }, schema, options(reserve()));
  assert.ok(!JSON.stringify(rows()).includes(secret));
});
test("无 options 保持 16000 输出、120 秒、两次尝试且不写日志", async t => {
  const timeouts: number[] = []; t.mock.method(AbortSignal, "timeout", (ms: number) => { timeouts.push(ms); return new AbortController().signal; });
  let calls = 0;
  globalThis.fetch = async (_url, init) => { calls++; assert.equal(JSON.parse(init!.body as string).max_tokens, 16000); return response(null, calls === 1 ? "{" : '{"reply":"answer"}'); };
  assert.deepEqual(await generateJson("instruction", {}, schema), { reply: "answer" });
  assert.equal(calls, 2); assert.equal(rows().length, 0); assert.ok(timeouts.every(ms => ms <= 120000 && ms > 119000));
});
test("精练观测每次 provider 尝试一行且 package_id 为空，不占速刷额度", async () => {
  let calls = 0;
  globalThis.fetch = async () => response(null, ++calls === 1 ? "{" : '{"reply":"answer"}');
  await generateJson("instruction", {}, schema, { purpose: "scoring", userId: "u" });
  assert.deepEqual(rows().map(r => [r.package_id, r.outcome, r.attempt]), [[null, "invalid_output", 1], [null, "ok", 2]]);
  assert.equal(reserveCall(input).ok, true);
});
test("观测日志插入失败不影响调用；HTTP 错误为 provider_error，日志不含上游正文", async t => {
  t.mock.method(console, "error", () => {});
  sqlite.exec("CREATE TRIGGER fail_reserve BEFORE INSERT ON llm_calls BEGIN SELECT RAISE(ABORT, 'fail'); END");
  globalThis.fetch = async () => response();
  assert.deepEqual(await generateJson("instruction", {}, schema, { purpose: "scoring", userId: "u" }), { reply: "answer" });
  sqlite.exec("DROP TRIGGER fail_reserve");
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "PRIVATE_UPSTREAM" }), { status: 503 });
  await assert.rejects(generateJson("instruction", {}, schema, options(reserve())));
  assert.equal(rows()[0].outcome, "provider_error"); assert.ok(!JSON.stringify(rows()).includes("PRIVATE_UPSTREAM"));
});
test("包用满拒绝；新 operationId/sessionId/packageId 仍受用户限额，滚出窗口后恢复", () => {
  for (let i = 0; i < 15; i++) {
    const r = reserve({ packageId: `p${i}`, operationId: `op${i}`, sessionId: `s${i}` });
    settleCall(r, { usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1, outcome: "ok" });
  }
  assert.deepEqual(reserveCall({ ...input, operationId: "fresh-op", packageId: "fresh-p", sessionId: "fresh-s" }), { ok: false, reason: "user_quota", retryAt: "2026-11-02T12:00:00.000Z" });
  assert.equal(reserveCall({ ...input, now: "2026-11-02T12:00:00.000Z" }).ok, true);
  assert.deepEqual(reserveCall({ ...input, now: "2026-11-02T12:00:00.000Z", packageLimits: { ...quickBudget.initial.limits, calls: 1 } }), { ok: false, reason: "package_quota", retryAt: null });
});
test("并发：真实 SQLite 两进程两连接，两张卡片争抢用户最后一次额度只有一个成功", { timeout: 15000 }, async () => {
  for (let i = 0; i < 14; i++) {
    const r = reserve({ packageId: `seed${i}`, operationId: `seed${i}` });
    settleCall(r, { usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1, outcome: "ok" });
  }
  const children = ["card-a", "card-b"].map(() => fork(resolve("tests/helpers/llm-reserve-worker.ts"), [], { execArgv: ["--conditions=react-server", "--import", "tsx"], env: { ...process.env, LLM_API_KEY: "" }, stdio: ["ignore", "ignore", "pipe", "ipc"] }));
  try {
    const ready = children.map(child => new Promise<void>((resolve, reject) => { child.on("message", msg => { if (msg === "ready") resolve(); }); child.on("error", reject); child.on("exit", code => { if (code) reject(new Error(`worker exit ${code}`)); }); }));
    const results = children.map(child => new Promise<ReserveCallResult>((resolve, reject) => { child.on("message", msg => { if (msg !== "ready") resolve(msg as ReserveCallResult); }); child.on("error", reject); child.on("exit", code => { if (code) reject(new Error(`worker exit ${code}`)); }); }));
    await Promise.all(ready); children.forEach((child, i) => child.send({ ...input, packageId: `card-${i}`, operationId: `op-${i}` }));
    const answers = await Promise.all(results);
    assert.equal(answers.filter(r => r.ok).length, 1);
    assert.deepEqual(answers.find(r => !r.ok), { ok: false, reason: "user_quota", retryAt: "2026-11-02T12:00:00.000Z" });
    assert.equal(rows().length, 15);
  } finally { children.forEach(child => child.kill()); }
});

test("预留令牌不可复制或重复派发，事务内调用与不同用户/用途均在 fetch 前拒绝", async () => {
  const r = reserve(); let calls = 0;
  globalThis.fetch = async () => { calls++; return response(); };
  await assert.rejects(generateJson("instruction", {}, schema, options({ ...r })), /Reservation/);
  await assert.rejects(generateJson("instruction", {}, schema, { ...options(r), userId: "other" }), /Reservation/);
  await assert.rejects(generateJson("instruction", {}, schema, { ...options(r), purpose: "quick_followup" }), /Reservation/);
  let pending: Promise<unknown> | undefined;
  sqlite.transaction(() => { pending = generateJson("instruction", {}, schema, options(r)); }).immediate();
  await assert.rejects(pending!, /outside a transaction/);
  assert.equal(calls, 0);
  await generateJson("instruction", {}, schema, options(r));
  await assert.rejects(generateJson("instruction", {}, schema, options(r)), /Reservation/);
  assert.equal(calls, 1);
});
test("另一个用户的相同 packageId/operationId 不占本用户额度", () => {
  sqlite.prepare("INSERT INTO users(id,email,name,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)").run("other", "other@test.invalid", "Test", "fake", now, now);
  for (let i = 0; i < 15; i++) {
    const r = reserve({ packageId: `p${i}` });
    settleCall(r, { usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1, outcome: "ok" });
  }
  const result = reserveCall({ ...input, userId: "other", packageId: "p0" });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.reservation.attempt, 1);
});

test("响应中断报 AbortError 但本地时限未到：记 indeterminate，不错误释放预留", async () => {
  globalThis.fetch = async () => { throw new DOMException("connection aborted", "AbortError"); };
  await assert.rejects(generateJson("instruction", {}, schema, options(reserve())), /无法连接/);
  assert.equal(rows()[0].outcome, "indeterminate"); assert.equal(occupiedBudget(rows()).waitMs, 25000);
});
test("非预留 options 的输出/超时/retries 参数生效；reserved 始终采用持久化限额", async t => {
  const timeouts: number[] = [];
  t.mock.method(AbortSignal, "timeout", (ms: number) => { timeouts.push(ms); return new AbortController().signal; });
  globalThis.fetch = async (_url, init) => { assert.equal(JSON.parse(init!.body as string).max_tokens, 64); return response(null, "{"); };
  await assert.rejects(generateJson("instruction", {}, schema, { purpose: "scoring", userId: "u", maxOutputTokens: 64, timeoutMs: 200, retries: 0 }));
  assert.equal(rows().length, 1); assert.ok(timeouts[0] <= 200 && timeouts[0] > 0);
  globalThis.fetch = async (_url, init) => { assert.equal(JSON.parse(init!.body as string).max_tokens, 512); return response(); };
  const r = reserve({ purpose: "quick_followup", perCall: { inputTokens: 4000, maxOutputTokens: 512 }, packageLimits: { ...quickBudget.initial.limits, waitMs: 1234 } });
  await generateJson("instruction", {}, schema, { ...options(r), maxOutputTokens: 16000, timeoutMs: 120000 });
  assert.equal(timeouts[1], 1234);
});
