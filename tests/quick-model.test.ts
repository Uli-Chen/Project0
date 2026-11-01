import assert from "node:assert/strict";
import { after, test } from "node:test";
import { quickFixture } from "./helpers/quick-api";
import { getCard, cardRequirements } from "../lib/db/queries/cards";
import { cardSlots } from "../lib/quick/layouts";
import { recoverQuickOperations } from "../lib/pipeline/quick-model";
import { recoverInflightCalls } from "../lib/llm/calls";
import { table } from "./helpers/practice-db";
const f = quickFixture(), db = f.db.$client;
process.env.LLM_API_KEY = "fake";
const oldFetch = globalThis.fetch;
after(() => { globalThis.fetch = oldFetch; f.close(); });
let calls = 0;
function fake(handler?: (ctx: { requirements: { id: string }[] }) => unknown) {
  globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.ok(body.max_tokens === 768 || body.max_tokens === 512);
    assert.equal(db.inTransaction, false);
    const context = JSON.parse(body.messages[1].content);
    const result = handler ? handler(context) : { results: context.requirements.map((r: { id: string }) => ({ id: r.id, status: "met", note: null })) };
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(result) } }], usage: { prompt_tokens: 500, completion_tokens: 50 } });
  };
}
async function action(id: string, body: unknown, status = 200) {
  const r = await f.call("action", id, body), p = await r.json(); assert.equal(r.status, status, JSON.stringify(p)); return p;
}
async function create(fill = true) {
  // Keep independent cases below the shared rolling ceiling.
  db.prepare("UPDATE llm_calls SET started_at='2020-01-01T00:00:00.000Z'").run();
  const r = await f.call("create", "", { questionId: "qb_mock_health_001", activity: "quick", mode: "practice", idempotencyKey: crypto.randomUUID() });
  assert.equal(r.status, 201); const id = (await r.json()).session.id as string;
  if (fill) await action(id, { action: "cardSave", cardVersion: 0, parts: cardSlots(cardRequirements(getCard("u", id)!)).map(s => ({ key: s.key, text: "我的观点及相关原因" })) });
  return id;
}
test("empty requirements use deterministic gaps without model or package; passing writes exactly one event and unchanged check is free", async () => {
  fake(); const id = await create(false), before = calls;
  let p = await action(id, { action: "quickCheck", cardVersion: 0 });
  assert.equal(calls, before); assert.equal(p.card.state, "needs_development"); assert.equal(p.budget.packageId, null);
  assert.ok(p.checkResults[0].results.every((r: { status: string }) => r.status === "gap"));
  await action(id, { action: "cardSave", cardVersion: 0, parts: cardSlots(cardRequirements(getCard("u", id)!)).map(s => ({ key: s.key, text: "原因及解释" })) });
  const memoryBefore = JSON.stringify(table(db, "familiarity"));
  p = await action(id, { action: "quickCheck", cardVersion: 1 });
  assert.equal(p.card.state, "passed"); assert.equal(calls, before + 1);
  const event = db.prepare("SELECT * FROM completion_events WHERE attempt_id=?").get(id); assert.ok(event);
  await action(id, { action: "quickCheck", cardVersion: 1, requestId: crypto.randomUUID() });
  assert.equal(calls, before + 1); assert.deepEqual(db.prepare("SELECT * FROM completion_events WHERE attempt_id=?").get(id), event);
  assert.equal(JSON.stringify(table(db, "familiarity")), memoryBefore);
});
test("saving while check is in flight yields stale without completion or overwriting newer card", async () => {
  const id = await create(); let release!: () => void, entered!: () => void;
  const barrier = new Promise<void>(r => { entered = r; }), wait = new Promise<void>(r => { release = r; });
  fake(); const fetcher = globalThis.fetch;
  globalThis.fetch = async (...args) => { entered(); await wait; return fetcher(...args); };
  const pending = action(id, { action: "quickCheck", cardVersion: 1 }); await barrier;
  const repeated = await action(id, { action: "quickCheck", cardVersion: 1 }); assert.equal(repeated.operations[0].status, "running");
  await action(id, { action: "cardSave", cardVersion: 1, parts: [{ key: "reasons.answer", text: "新的原因" }] });
  release(); const p = await pending;
  assert.equal(p.operations[0].status, "stale"); assert.equal(p.card.contentVersion, 2); assert.equal(p.card.state, "draft");
  assert.equal(db.prepare("SELECT * FROM completion_events WHERE attempt_id=?").get(id), undefined);
});
test("invalid English example notes consume one shared automatic retry; frozen manual retry cannot gain another", async () => {
  const id = await create(); const before = calls;
  fake(ctx => ({ results: ctx.requirements.map(r => ({ id: r.id, status: "gap", note: "This is a complete example to copy" })) }));
  const p = await action(id, { action: "quickCheck", cardVersion: 1 });
  assert.equal(calls, before + 2); assert.equal(p.operations[0].status, "invalid_output"); assert.equal(p.budget.remaining.retries, 0);
  await action(id, { action: "quickRetry", operationId: p.operations[0].id }, 409);
  assert.equal(p.card.state, "draft");
});
test("followup logical slot deduplicates until user answer; never writes model text into card; maximum two", async () => {
  const id = await create(); fake(() => ({ question: "为什么会产生这种影响？", targetKey: null })); const before = calls;
  let p = await action(id, { action: "quickFollowup", cardVersion: 1 });
  await action(id, { action: "quickFollowup", cardVersion: 1 }); assert.equal(calls, before + 1);
  await action(id, { action: "quickAnswer", text: "这是我的解释" });
  p = await action(id, { action: "quickFollowup", cardVersion: 1 }); assert.equal(calls, before + 2);
  assert.ok(p.card.content.parts.every((r: { text: string }) => !r.text.includes("为什么")));
  await action(id, { action: "quickAnswer", text: "第二次解释" });
  await action(id, { action: "quickFollowup", cardVersion: 1 }, 409);
});
test("supplemental package closes old allowance, cooldown and unchanged cards cannot reset budget", async () => {
  const id = await create(); fake(); let p = await action(id, { action: "quickCheck", cardVersion: 1 });
  await action(id, { action: "quickSupplemental" }, 409);
  db.prepare("UPDATE quick_packages SET granted_at='2020-01-01T00:00:00.000Z' WHERE attempt_id=?").run(id);
  await action(id, { action: "quickSupplemental" }, 409);
  await action(id, { action: "cardSave", cardVersion: 1, parts: [{ key: "reasons.answer", text: "重新思考的答案" }] });
  p = await action(id, { action: "quickSupplemental" }); assert.equal(p.budget.kind, "supplemental"); assert.equal(p.budget.remaining.followups, 0);
  p = await action(id, { action: "quickCheck", cardVersion: 2 }); assert.equal(p.card.state, "passed"); assert.equal(p.budget.remaining.checks, 0);
});
test("startup recovers operations without calls; manual retry uses frozen input and becomes stale after edit", async () => {
  const id = await create(); fake(); let p = await action(id, { action: "quickCheck", cardVersion: 1 });
  const op = p.operations[0]; db.prepare("DELETE FROM quick_check_results WHERE attempt_id=?").run(id); db.prepare("DELETE FROM completion_events WHERE attempt_id=?").run(id);
  db.prepare("UPDATE quick_operations SET status='running' WHERE id=?").run(op.id);
  db.prepare("UPDATE llm_calls SET outcome='reserved' WHERE operation_id=?").run(op.id);
  const before = calls; assert.ok(recoverQuickOperations() >= 1); recoverInflightCalls(new Date().toISOString()); assert.equal(calls, before);
  await action(id, { action: "cardSave", cardVersion: 1, parts: [{ key: "reasons.answer", text: "新版本" }] });
  fake(ctx => { assert.ok(!JSON.stringify(ctx).includes("新版本")); return { results: ctx.requirements.map(r => ({ id: r.id, status: "met", note: null })) }; });
  p = await action(id, { action: "quickRetry", operationId: op.id }); assert.equal(p.operations[0].status, "stale");
  assert.equal(db.prepare("SELECT * FROM completion_events WHERE attempt_id=?").get(id), undefined);
});
test("input ceiling refuses dispatch with no reservation; deletion in flight cannot resurrect body or completion", async () => {
  let id = await create(); const before = calls; fake();
  await action(id, { action: "cardSave", cardVersion: 1, parts: cardSlots(cardRequirements(getCard("u", id)!)).map(s => ({ key: s.key, text: "长".repeat(600) })) });
  await action(id, { action: "quickCheck", cardVersion: 2 }, 422); assert.equal(calls, before);
  assert.equal(db.prepare("SELECT * FROM quick_operations WHERE attempt_id=?").get(id), undefined);
  id = await create(); let entered!: () => void, release!: () => void;
  const barrier = new Promise<void>(r => { entered = r; }), wait = new Promise<void>(r => { release = r; });
  const fetcher = globalThis.fetch; globalThis.fetch = async (...args) => { entered(); await wait; return fetcher(...args); };
  const pending = action(id, { action: "quickCheck", cardVersion: 1 }, 404); await barrier;
  assert.equal((await f.call("delete", id)).status, 200); release(); await pending;
  assert.equal(db.prepare("SELECT * FROM writing_sessions WHERE id=?").get(id), undefined);
  assert.equal(db.prepare("SELECT * FROM completion_events WHERE attempt_id=?").get(id), undefined);
  assert.ok(db.prepare("SELECT * FROM llm_calls WHERE session_id=?").get(id));
});
test("supplemental check can recover a technically failed unchanged version using its existing frozen operation", async () => {
  const id = await create(); fake(() => ({ broken: true }));
  let p = await action(id, { action: "quickCheck", cardVersion: 1 }); assert.equal(p.operations[0].status, "invalid_output"); const opId = p.operations[0].id;
  db.prepare("UPDATE quick_packages SET granted_at='2020-01-01T00:00:00.000Z' WHERE attempt_id=?").run(id);
  await action(id, { action: "quickSupplemental" }); fake();
  p = await action(id, { action: "quickCheck", cardVersion: 1 });
  assert.equal(p.operations[0].id, opId); assert.equal(p.card.state, "passed"); assert.equal(p.budget.remaining.checks, 0);
});
test("missing a question requirement is a deterministic gap; model sees only populated requirements", async () => {
  const id = await create(false);
  const slots = cardSlots(cardRequirements(getCard("u", id)!));
  const chosen = slots[0].requirementKey;
  await action(id, { action: "cardSave", cardVersion: 0, parts: slots.filter(s => s.requirementKey === chosen).map(s => ({ key: s.key, text: "原因及解释" })) });
  fake(ctx => { assert.equal(ctx.requirements.length, 1); return { results: [{ id: chosen, status: "met", note: null }] }; });
  const p = await action(id, { action: "quickCheck", cardVersion: 1 });
  assert.equal(p.card.state, "needs_development"); assert.ok(p.checkResults[0].results.some((r: { status: string }) => r.status === "gap"));
});
test("user rolling budget survives deletion and creation; quota rejection leaves manual saves available", async () => {
  const id = await create(); fake(); await action(id, { action: "quickCheck", cardVersion: 1 });
  const row = db.prepare("SELECT * FROM llm_calls WHERE session_id=?").get(id) as Record<string, unknown>;
  const columns = Object.keys(row), statement = db.prepare(`INSERT INTO llm_calls(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`);
  for (let i = 0; i < 14; i++) statement.run(...columns.map(key => key === "id" ? crypto.randomUUID() : key === "attempt" ? i + 2 : row[key]));
  await f.call("delete", id);
  const created = await f.call("create", "", { questionId: "qb_mock_health_001", activity: "quick", mode: "practice", idempotencyKey: crypto.randomUUID() }); const next = (await created.json()).session.id;
  await action(next, { action: "cardSave", cardVersion: 0, parts: cardSlots(cardRequirements(getCard("u", next)!)).map(s => ({ key: s.key, text: "原因及解释" })) });
  const before = calls;
  const p = await action(next, { action: "quickCheck", cardVersion: 1 }, 429); assert.equal(p.code, "user_quota"); assert.equal(calls, before);
  await action(next, { action: "cardSave", cardVersion: 1, parts: [{ key: "reasons.answer", text: "仍能编辑" }] });
});
test("all supplied receipt aliases are checked before replay; combining keys from different operations returns 409", async () => {
  const id = await create(); fake(); const first = crypto.randomUUID(), second = crypto.randomUUID();
  await action(id, { action: "quickCheck", cardVersion: 1, requestId: first });
  await action(id, { action: "cardSave", cardVersion: 1, parts: [{ key: "reasons.answer", text: "更新的观点" }] });
  await action(id, { action: "quickCheck", cardVersion: 2, requestId: second });
  const before = calls;
  await action(id, { action: "quickCheck", cardVersion: 1, requestId: first, idempotencyKey: second }, 409);
  await action(id, { action: "quickCheck", cardVersion: 2, requestId: second, idempotencyKey: first }, 409);
  assert.equal(calls, before);
  const alias = crypto.randomUUID();
  await action(id, { action: "quickCheck", cardVersion: 1, requestId: first, idempotencyKey: alias });
  assert.ok(db.prepare("SELECT * FROM request_receipts WHERE user_id='u' AND request_key=?").get(alias));
});
test("result persistence failure rolls back completion and exposes indeterminate for an explicit frozen retry", async () => {
  const id = await create(); fake();
  db.exec("CREATE TRIGGER test_result_fail BEFORE INSERT ON quick_check_results BEGIN SELECT RAISE(ABORT, 'test result failure'); END");
  let p;
  try { p = await action(id, { action: "quickCheck", cardVersion: 1 }); } finally { db.exec("DROP TRIGGER test_result_fail"); }
  assert.equal(p.operations[0].status, "indeterminate"); assert.equal(p.card.state, "draft");
  assert.equal(db.prepare("SELECT * FROM completion_events WHERE attempt_id=?").get(id), undefined);
  assert.equal(db.prepare("SELECT count(*) n FROM llm_calls WHERE session_id=?").get(id) && (db.prepare("SELECT count(*) n FROM llm_calls WHERE session_id=?").get(id) as {n: number}).n, 1);
  p = await action(id, { action: "quickRetry", operationId: p.operations[0].id });
  assert.equal(p.card.state, "passed"); assert.equal(p.budget.remaining.retries, 0);
});
test("followup rejects multiple questions and retries once; missing requirements and reasoning-quality instructions reach the model", async () => {
  const id = await create(false);
  await action(id, { action: "cardSave", cardVersion: 0, parts: [{ key: "reasons.answer", text: "我的观点" }] });
  let n = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body)), context = JSON.parse(body.messages[1].content);
    assert.ok(context.requirements.length > 0);
    assert.match(body.messages[0].content, /do not ask them to choose a stance again/);
    assert.match(body.messages[0].content, /repeat the previous question/);
    assert.equal(context.coachingFocus, "explain_reason");
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ question: ++n === 1 ? "你怎么想？为何这样？" : "你能想到什么观察来解释这种变化？", targetKey: "reasons.why" }) } }], usage: { prompt_tokens: 500, completion_tokens: 40 } });
  };
  let p = await action(id, { action: "quickFollowup", cardVersion: 1 });
  assert.equal(n, 2); assert.equal(p.operations[0].status, "ok"); assert.equal(p.budget.remaining.retries, 0);
  assert.equal(p.session.messages.length, 1);
  const filled = await create();
  globalThis.fetch = async (_url, init) => {
    calls++; const body = JSON.parse(String(init?.body)), context = JSON.parse(body.messages[1].content);
    assert.match(body.messages[0].content, /circular reasoning is a gap/);
    assert.match(body.messages[0].content, /ordinary clear explanations suffice/);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ results: context.requirements.map((r: {id: string}) => ({ id: r.id, status: "gap", note: "请解释该理由如何支持回答。" })) }) } }], usage: { prompt_tokens: 500, completion_tokens: 40 } });
  };
  p = await action(filled, { action: "quickCheck", cardVersion: 1 }); assert.equal(p.card.state, "needs_development");
});
