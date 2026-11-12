import assert from "node:assert/strict";
import { after, test } from "node:test";
import { quickFixture } from "./helpers/quick-api";
import { getCard, cardRequirements } from "../lib/db/queries/cards";
import { getSession, saveSession } from "../lib/db/queries/sessions";
import { cardSlots } from "../lib/quick/layouts";
import { recoverQuickOperations } from "../lib/pipeline/quick-model";
import { recoverInflightCalls } from "../lib/llm/calls";
import { table } from "./helpers/practice-db";
import { prompt } from "../lib/llm/prompts";
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

// Student speaks first: quickFollowup with text (docs/designs/quick_coach_free_input.md §4.2, §7.1).
type Msg = { id: string; role: string; stage: string; action?: string; content: string; userId?: string; afterFollowUp?: number; replyToMessageId?: string };
const askPrompt = prompt("quick/followup-ask"), followupPrompt = prompt("quick/followup");
let sent: { system: string; context: { messages?: { role: string; content: string }[] } }[] = [];
function coach(question = "你能想到一个身边的具体场景吗？") {
  sent = [];
  globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.max_tokens, 512); assert.equal(db.inTransaction, false);
    sent.push({ system: body.messages[0].content, context: JSON.parse(body.messages[1].content) });
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ question, targetKey: null }) } }], usage: { prompt_tokens: 500, completion_tokens: 40 } });
  };
}
const quickMessages = (p: { session: { messages: Msg[] } }) => p.session.messages.filter(m => m.stage === "quick");
const ask = (id: string, text: string, extra: Record<string, unknown> = {}, cardVersion = 1) => ({ action: "quickFollowup", cardVersion, text, ...extra });
test("T1 quickFollowup with text stores the student message, then one coach question from the ask prompt", async () => {
  const id = await create(); coach(); const before = calls, text = "我没什么思路，帮我分析一下";
  const p = await action(id, ask(id, text));
  assert.equal(calls, before + 1);
  const [said, question, ...rest] = quickMessages(p);
  assert.equal(rest.length, 0);
  assert.deepEqual({ role: said.role, action: said.action, userId: said.userId, afterFollowUp: said.afterFollowUp, content: said.content, reply: said.replyToMessageId }, { role: "user", action: "quickAsk", userId: "u", afterFollowUp: 0, content: text, reply: undefined });
  assert.deepEqual({ role: question.role, action: question.action, content: question.content }, { role: "coach", action: "quickFollowup", content: "你能想到一个身边的具体场景吗？" });
  assert.equal(sent.length, 1); assert.ok(sent[0].system.includes(askPrompt)); assert.ok(!sent[0].system.includes(followupPrompt));
  assert.deepEqual(sent[0].context.messages?.at(-1), { role: "user", content: text });
  assert.equal(p.operations.length, 1); assert.equal(p.operations[0].slot, "followup:1"); assert.equal(p.operations[0].status, "ok");
  assert.equal(JSON.parse((db.prepare("SELECT input_json FROM quick_operation_inputs WHERE operation_id=?").get(p.operations[0].id) as { input_json: string }).input_json).variant, "ask");
  assert.equal(p.budget.remaining.followups, 1);
});
test("T2/T3 replaying a requestId adds nothing and calls no model; the same requestId with other text conflicts", async () => {
  const id = await create(); coach(); const requestId = crypto.randomUUID();
  await action(id, ask(id, "我觉得离家上学能锻炼独立", { requestId }));
  const before = calls, snapshot = f.snapshot();
  const replay = await action(id, ask(id, "我觉得离家上学能锻炼独立", { requestId }));
  assert.equal(calls, before); assert.equal(quickMessages(replay).length, 2);
  assert.deepEqual(f.snapshot(), snapshot);
  const conflict = await action(id, ask(id, "换一句话", { requestId }), 409);
  assert.equal(conflict.code, "idempotency_conflict"); assert.equal(calls, before); assert.deepEqual(f.snapshot(), snapshot);
});
test("receipts come before the closed and card-version checks for text requests; requests without text keep the old order", async () => {
  const id = await create(); coach(); const requestId = crypto.randomUUID();
  await action(id, ask(id, "我觉得离家上学能锻炼独立", { requestId }));
  // A card edit after the send: the replay still carries the old cardVersion and must hit the receipt.
  await action(id, { action: "cardSave", cardVersion: 1, parts: [{ key: "reasons.answer", text: "改过的原因" }] });
  const state = getSession("u", id)!; state.lifecycle = "closed"; saveSession("u", state);
  const before = calls, snapshot = f.snapshot();
  const replay = await action(id, ask(id, "我觉得离家上学能锻炼独立", { requestId }));
  assert.equal(quickMessages(replay).length, 2); assert.equal(calls, before); assert.deepEqual(f.snapshot(), snapshot);
  const conflict = await action(id, ask(id, "换一句话", { requestId }), 409);
  assert.equal(conflict.code, "idempotency_conflict");
  const fresh = await action(id, ask(id, "新的一句", {}, 2), 409);
  assert.equal(fresh.error, "练习已关闭。");
  const plain = await action(id, { action: "quickFollowup", cardVersion: 2, requestId }, 409);
  assert.equal(plain.error, "练习已关闭。"); assert.equal(calls, before); assert.deepEqual(f.snapshot(), snapshot);
});
test("T4 text while a coach question is pending is refused with followup_pending", async () => {
  const id = await create(); coach(); f.followup(id); const before = calls, snapshot = f.snapshot();
  const p = await action(id, ask(id, "直接给我三个理由"), 409);
  assert.deepEqual(p, { error: "请先回答教练的上一个问题。", code: "followup_pending" });
  assert.equal(calls, before); assert.deepEqual(f.snapshot(), snapshot);
});
let unfinished: { id: string; operationId: string; messageId: string } | undefined;
test("T5 a network failure keeps the student message with a failed operation; new text is refused with followup_unfinished", async () => {
  const id = await create(); const before = calls;
  globalThis.fetch = async () => { calls++; throw new TypeError("fetch failed"); };
  const p = await action(id, ask(id, "这道题到底在问什么"));
  assert.equal(calls, before + 1);
  const messages = quickMessages(p);
  assert.equal(messages.length, 1); assert.equal(messages[0].action, "quickAsk"); assert.equal(messages[0].content, "这道题到底在问什么");
  assert.equal(p.operations.length, 1); assert.equal(p.operations[0].status, "indeterminate"); assert.equal(p.budget.remaining.retries, 1);
  coach(); const snapshot = f.snapshot();
  const refused = await action(id, ask(id, "那我换个问法"), 409);
  assert.deepEqual(refused, { error: "上一次追问还没有完成，请稍等或先重试。", code: "followup_unfinished" });
  assert.equal(calls, before + 1); assert.deepEqual(f.snapshot(), snapshot);
  unfinished = { id, operationId: p.operations[0].id, messageId: messages[0].id };
});
test("T6 quickRetry of the failed ask reuses the ask prompt and answers after the student message", async () => {
  assert.ok(unfinished); const { id, operationId, messageId } = unfinished; coach("你觉得题目里哪个词最让你拿不准？"); const before = calls;
  const p = await action(id, { action: "quickRetry", operationId });
  assert.equal(calls, before + 1); assert.equal(sent.length, 1);
  assert.ok(sent[0].system.includes(askPrompt)); assert.ok(!sent[0].system.includes(followupPrompt));
  assert.deepEqual(sent[0].context.messages, [{ role: "user", content: "这道题到底在问什么" }]);
  const messages = quickMessages(p);
  assert.deepEqual(messages.map(m => [m.role, m.action]), [["user", "quickAsk"], ["coach", "quickFollowup"]]);
  assert.equal(messages[0].id, messageId); assert.equal(p.operations[0].status, "ok"); assert.equal(p.budget.remaining.retries, 0);
});
test("T7 text after both follow-ups are used is refused with quota_exhausted and leaves no message", async () => {
  const id = await create(); coach();
  await action(id, { action: "quickFollowup", cardVersion: 1 }); await action(id, { action: "quickAnswer", text: "第一次回答" });
  await action(id, { action: "quickFollowup", cardVersion: 1 }); await action(id, { action: "quickAnswer", text: "第二次回答" });
  const before = calls, snapshot = f.snapshot();
  const p = await action(id, ask(id, "再帮我想想"), 409);
  assert.equal(p.code, "quota_exhausted"); assert.equal(calls, before); assert.deepEqual(f.snapshot(), snapshot);
});
test("T8 blank or over-long text is a 400 validation error with no change", async () => {
  const id = await create(); coach(); const before = calls, snapshot = f.snapshot();
  const invalidSave = await f.call("action", id, { action: "cardSave", cardVersion: 1, parts: [{ key: "reasons.answer", text: "长".repeat(601) }] });
  for (const text of ["   \n ", "", "问".repeat(1001)]) assert.equal((await f.call("action", id, ask(id, text))).status, invalidSave.status);
  assert.equal(invalidSave.status, 400); assert.equal(calls, before); assert.deepEqual(f.snapshot(), snapshot);
});
test("T9 cardExcerpt can take text from the student's own quickAsk message", async () => {
  const id = await create(false); coach(); const text = "我觉得长时间久坐是主要原因";
  const asked = await action(id, ask(id, text, {}, 0));
  const said = quickMessages(asked)[0]; assert.equal(said.action, "quickAsk");
  const key = cardSlots(cardRequirements(getCard("u", id)!))[0].key;
  const p = await action(id, { action: "cardExcerpt", cardVersion: 0, key, messageId: said.id, start: 3, end: text.length });
  const part = p.card.content.parts.find((x: { key: string }) => x.key === key);
  assert.equal(part.text, text.slice(3)); assert.deepEqual(part.provenance, { kind: "excerpt", userId: "u", messageId: said.id, start: 3, end: text.length });
});
test("T10 ask, answer, ask, answer: the third ask is refused and there are exactly two coach questions", async () => {
  const id = await create(); coach(); const before = calls;
  let p = await action(id, ask(id, "我没什么思路"));
  p = await action(id, { action: "quickAnswer", text: "可能是因为工作太忙" });
  p = await action(id, ask(id, "那我还能从哪里想？"));
  assert.equal(quickMessages(p).at(-2)?.afterFollowUp, 1);
  p = await action(id, { action: "quickAnswer", text: "家里人做饭的时间也少了" });
  const third = await action(id, ask(id, "再问一个"), 409);
  assert.equal(third.code, "quota_exhausted"); assert.equal(calls, before + 2);
  p = await f.call("quick", id).then(r => r.json());
  assert.deepEqual(quickMessages(p).map(m => `${m.role}:${m.action}`), ["user:quickAsk", "coach:quickFollowup", "user:quickAnswer", "user:quickAsk", "coach:quickFollowup", "user:quickAnswer"]);
});
