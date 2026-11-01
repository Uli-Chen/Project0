import { createQuestionPractice } from "../lib/db/create-practice";
import { isStudentAction } from "../lib/rules/student-action";
import { seedQuickEvidence } from "./helpers/quick-records";
import { hashPassword } from "../lib/auth/password";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fork } from "node:child_process";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { quickFixture } from "./helpers/quick-api";
import { requirements, essay, evaluation, time, table } from "./helpers/practice-db";
import { requirementSchema } from "../lib/question-bank/types";
import { cardSlots } from "../lib/quick/layouts";
import { getCard } from "../lib/db/queries/cards";
import { getSession, saveSession, deleteSession } from "../lib/db/queries/sessions";
import { commitQuickMutation } from "../lib/pipeline/quick";
import { completionEvents, topicCards, users, questions } from "../lib/db/schema";

const f = quickFixture(), db = f.db;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("No model or network is allowed in WP4a"); };
after(() => { globalThis.fetch = originalFetch; f.close(); });
const createBody = () => ({ questionId: "qb_mock_health_001", activity: "quick", mode: "practice", idempotencyKey: crypto.randomUUID() });
async function create() {
  const response = await f.call("create", "", createBody()); assert.equal(response.status, 201);
  return (await response.json()).session.id as string;
}
async function action(id: string, body: unknown, status = 200) {
  const response = await f.call("action", id, body); const payload = await response.json();
  assert.equal(response.status, status, JSON.stringify(payload)); return payload;
}
const save = (id: string, cardVersion: number, text = "我的原因") => action(id, { action: "cardSave", cardVersion, parts: [{ key: "reasons.answer", text }] });
function completed(id: string, activity: "quick" | "deep", completedAt = time) {
  const s = getSession("u", id)!;
  db.insert(completionEvents).values({ userId: "u", attemptId: id, activity, exposureKey: s.question!.exposureKey,
    questionId: s.question!.id, primaryTopic: s.question!.primaryTopic, questionType: s.question!.questionType,
    completedAt, freshness: "unknown", relation: activity === "deep" ? "continuation" : "none" }).run();
}

test("38 道题的每组槽位与本题 subquestions 一一对应；原因与对策分别成组，未添加反方模板", () => {
  assert.equal(requirements.length, 38);
  const layouts = new Set<string>();
  for (const raw of requirements) {
    const req = requirementSchema.parse(raw), slots = cardSlots(req); layouts.add(req.layout);
    assert.deepEqual([...new Set(slots.map(s => s.requirementKey))], req.subquestions.map(q => q.key), req.id);
    assert.equal(new Set(slots.map(s => s.key)).size, slots.length);
    for (const q of req.subquestions) {
      const group = slots.filter(s => s.requirementKey === q.key);
      assert.ok(group.some(s => s.key === `${q.key}.answer`));
      assert.ok(group.some(s => s.key === `${q.key}.why`));
      for (const s of group) { assert.equal(s.en, q.en); assert.equal(s.zh, q.zh); }
    }
    if (req.layout === "problem_solution") assert.equal(new Set(slots.map(s => s.requirementKey)).size, 2);
  }
  assert.equal(layouts.size, 5);
  for (const action of ["cardSave", "cardExcerpt", "quickAnswer", "continueDeep"] as const) assert.equal(isStudentAction({ kind: "action", action }), true);
});

test("创建速刷同一事务保存空卡片、题目快照、marker、学生时间与回执；重复创建不增卡", async () => {
  const body = createBody(), first = await f.call("create", "", body), s = (await first.json()).session;
  assert.equal(first.status, 201); assert.equal(s.stage, "quick"); assert.equal(s.activity, "quick");
  assert.equal(s.lastStudentActionAt, s.createdAt); assert.deepEqual(s.messages, []);
  const card = getCard("u", s.id)!; assert.equal(card.contentVersion, 0); assert.equal(card.state, "draft"); assert.deepEqual(card.content.parts, []);
  assert.ok(table(db.$client, "attempt_markers").some(m => m.attempt_id === s.id && m.activity === "quick"));
  const retry = await f.call("create", "", body); assert.equal(retry.status, 200); assert.equal((await retry.json()).session.id, s.id);
  assert.deepEqual(getCard("u", s.id), card);
  const mock = await f.call("create", "", { ...createBody(), mode: "mock" }); assert.equal(mock.status, 409);
});

test("cardSave 版本冲突为 409 card_conflict，卡片、会话与所有回执完全不变", async () => {
  const id = await create(); await save(id, 0); const before = f.snapshot();
  assert.equal((await action(id, { action: "cardSave", cardVersion: 0, parts: [{ key: "reasons.answer", text: "覆盖" }] }, 409)).code, "card_conflict");
  assert.deepEqual(f.snapshot(), before);
});

test("Directly typed card; selected user excerpt：来源真实；编辑摘取变 direct；未改文字保留来源", async () => {
  const id = await create();
  let result = await save(id, 0, "  原因是缺乏时间  ");
  const direct = result.card.content.parts[0]; assert.equal(direct.text, "原因是缺乏时间");
  assert.equal(direct.provenance.kind, "direct"); assert.equal(direct.provenance.userId, "u"); assert.equal(direct.provenance.contentVersion, 1);
  assert.match(direct.provenance.editId, /^[0-9a-f-]{36}$/); assert.ok(direct.provenance.editedAt); assert.equal(direct.afterFollowUp, 0);
  const coach = f.followup(id);
  const requestId = crypto.randomUUID();
  result = await action(id, { action: "quickAnswer", text: "因😀果需要解释", requestId });
  const message = result.session.messages.at(-1);
  assert.equal(message.userId, "u"); assert.equal(message.afterFollowUp, 1); assert.equal(message.replyToMessageId, coach.id);
  assert.equal((await action(id, { action: "quickAnswer", text: message.content, requestId })).session.messages.at(-1).id, message.id);
  result = await action(id, { action: "cardExcerpt", cardVersion: 1, key: "reasons.why", messageId: message.id, start: 1, end: 4 });
  assert.deepEqual(result.card.content.parts[1], { key: "reasons.why", text: "😀果", afterFollowUp: 1,
    provenance: { kind: "excerpt", userId: "u", messageId: message.id, start: 1, end: 4 } });
  assert.deepEqual(result.card.content.parts[0], direct);
  const unchanged = getCard("u", id), session = getSession("u", id);
  await action(id, { action: "cardSave", cardVersion: 2, parts: [{ key: "reasons.why", text: "😀果" }] });
  assert.deepEqual(getCard("u", id), unchanged); assert.deepEqual(getSession("u", id), session);
  result = await action(id, { action: "cardSave", cardVersion: 2, parts: [{ key: "reasons.why", text: "解释后的结果" }] });
  assert.equal(result.card.content.parts[1].provenance.kind, "direct"); assert.equal(result.card.content.parts[1].provenance.contentVersion, 3);
  f.followup(id); await action(id, { action: "quickAnswer", text: "第二轮回答" });
  result = await save(id, 3, "第二轮原因"); assert.equal(result.card.content.parts[0].afterFollowUp, 2);
});

test("摘取教练、他人、别的会话、未知作者、越界或切开代理对均拒绝，正文不变", async () => {
  const id = await create(), otherId = await create(), coach = f.followup(id);
  const s = getSession("u", id)!;
  s.messages.push({ id: "other-user", role: "user", userId: "other", stage: "quick", content: "别人的文字" },
    { id: "no-owner", role: "user", stage: "quick", content: "未知所有者" },
    { id: "valid", role: "user", userId: "u", stage: "quick", content: "a😀bc" }); saveSession("u", s);
  const foreign = f.followup(otherId), before = f.snapshot();
  for (const [messageId, start, end] of [[coach.id, 0, 2], ["other-user", 0, 2], ["no-owner", 0, 2], [foreign.id, 0, 2], ["valid", 0, 99], ["valid", 2, 4], ["valid", 0, 2], ["valid", 3, 2], ["valid", -1, 2]]) {
    await action(id, { action: "cardExcerpt", cardVersion: 0, key: "reasons.answer", messageId, start, end }, 400);
    assert.deepEqual(f.snapshot(), before);
  }
});

test("Passed card edited：保存后 unchecked、同一卡片 ID、历史完成事件与检查版本不变", async () => {
  const id = await create(); await save(id, 0);
  db.update(topicCards).set({ state: "passed", lastCheckId: "fixture-check", lastCheckedVersion: 1 }).where(eq(topicCards.attemptId, id)).run();
  completed(id, "quick"); const events = table(db.$client, "completion_events"), before = getCard("u", id)!;
  const result = await save(id, 1, "修改后的学生想法");
  assert.equal(result.card.id, before.id); assert.equal(result.card.state, "unchecked"); assert.equal(result.card.lastCheckedVersion, 1);
  assert.equal(result.card.lastCheckId, "fixture-check"); assert.deepEqual(table(db.$client, "completion_events"), events);
});

test("卡片部分保存、空串清空、600 字边界、非法槽位与重复槽位；no-op 不增加会话或卡片版本", async () => {
  const id = await create(); await save(id, 0, "😀".repeat(600));
  const state = getSession("u", id)!;
  await save(id, 1, "😀".repeat(600)); assert.deepEqual(getSession("u", id), state);
  for (const parts of [[{ key: "reasons.answer", text: "字".repeat(601) }], [{ key: "not-a-slot", text: "内容" }], [{ key: "reasons.answer", text: "a" }, { key: "reasons.answer", text: "b" }]]) {
    await action(id, { action: "cardSave", cardVersion: 1, parts }, 400);
  }
  const cleared = await save(id, 1, "  "); assert.deepEqual(cleared.card.content.parts, []); assert.equal(cleared.card.contentVersion, 2);
  const key = crypto.randomUUID(); const empty = await action(id, { action: "cardSave", cardVersion: 2, parts: [], requestId: key });
  assert.equal(empty.session.version, cleared.session.version); assert.equal(empty.session.lastStudentActionAt, cleared.session.lastStudentActionAt);
  assert.ok(empty.session.completedRequests.includes(key));
});

test("quickAnswer 仅可回答待答教练追问；重复答案拒绝、请求重放不重复插入、参数冲突 409", async () => {
  const id = await create(); await action(id, { action: "quickAnswer", text: "没有问题" }, 409);
  f.followup(id); const key = crypto.randomUUID();
  await action(id, { action: "quickAnswer", text: "回答", idempotencyKey: key });
  const before = f.snapshot(); await action(id, { action: "quickAnswer", text: "回答", idempotencyKey: key }); assert.deepEqual(f.snapshot(), before);
  assert.equal((await action(id, { action: "quickAnswer", text: "换参数", idempotencyKey: key }, 409)).code, "idempotency_conflict");
  await action(id, { action: "quickAnswer", text: "重复答" }, 409);
});

test("默认子练习唯一：重复点击、刷新请求 ID、并发两次与明确另开幂等；空卡片允许继续", async () => {
  const id = await create();
  const results = await Promise.all([0, 1].map(() => action(id, { action: "continueDeep", explicitNew: false, requestId: crypto.randomUUID() })));
  const child = results[0].deepSession;
  assert.equal(results[1].deepSession.id, child.id); assert.deepEqual(child.cardSnapshot.content.parts, []);
  assert.equal(child.mode, "practice"); assert.equal(child.activity, "deep"); assert.equal(child.continuedFromQuickId, id);
  assert.deepEqual(child.question, results[0].session.question); assert.equal(child.stage, "prewriting");
  assert.equal((await action(id, { action: "continueDeep", explicitNew: false })).deepSession.id, child.id);
  const key = crypto.randomUUID(), another = await action(id, { action: "continueDeep", explicitNew: true, idempotencyKey: key });
  assert.notEqual(another.deepSession.id, child.id);
  const replayId = crypto.randomUUID();
  const replay = await action(id, { action: "continueDeep", explicitNew: true, idempotencyKey: key, requestId: replayId });
  assert.equal(replay.deepSession.id, another.deepSession.id); assert.ok(replay.session.completedRequests.includes(replayId));
  assert.equal((await action(id, { action: "continueDeep", explicitNew: true, idempotencyKey: "different-key", requestId: replayId })).deepSession.id, another.deepSession.id);
  await action(id, { action: "cardSave", cardVersion: 0, parts: [], requestId: replayId }, 409);
  assert.equal(table(db.$client, "default_continuations").find(r => r.quick_attempt_id === id)!.deep_attempt_id, child.id);
  assert.equal((await action(id, { action: "continueDeep", explicitNew: false, idempotencyKey: key }, 409)).code, "idempotency_conflict");
  await action(id, { action: "continueDeep", explicitNew: true }, 400);
});

test("真实两进程 SQLite 并发 continueDeep 只能分配一个默认子练习", async () => {
  const id = await create();
  const workers = [0, 1].map(() => {
    const child = fork(resolve("tests/helpers/quick-worker.ts"), [id], { execArgv: ["--conditions=react-server", "--import", "tsx"],
      env: { ...process.env, DATABASE_PATH: f.filename, LLM_API_KEY: "" }, stdio: ["ignore", "pipe", "pipe", "ipc"] });
    const ready = new Promise<void>((resolve, reject) => { child.once("error", reject); child.once("message", () => resolve()); });
    const result = new Promise<string>((resolve, reject) => {
      child.on("message", (message: { childId?: string; error?: string }) => { if (message.childId) resolve(message.childId); if (message.error) reject(new Error(message.error)); });
      child.on("exit", code => { if (code) reject(new Error(`worker exited ${code}`)); });
    });
    return { child, ready, result };
  });
  try {
    await Promise.all(workers.map(w => w.ready)); workers.forEach(w => w.child.send("go"));
    const ids = await Promise.all(workers.map(w => w.result)); assert.equal(ids[0], ids[1]);
    assert.equal(table(db.$client, "default_continuations").filter(r => r.quick_attempt_id === id).length, 1);
    assert.equal(table(db.$client, "writing_sessions").filter(r => JSON.parse(r.state_json as string).continuedFromQuickId === id).length, 1);
  } finally { workers.forEach(w => w.child.kill()); }
});

test("默认子练习删除或 closed 未完成返回 default_child_gone；已完成 closed 可打开；explicitNew 不覆盖映射", async () => {
  for (const scenario of ["deleted", "abandoned", "completed"] as const) {
    const id = await create(), requestId = crypto.randomUUID();
    const child = (await action(id, { action: "continueDeep", explicitNew: false, requestId })).deepSession;
    if (scenario === "deleted") deleteSession("u", child.id);
    else { child.lifecycle = "closed"; saveSession("u", child); if (scenario === "completed") completed(child.id, "deep"); }
    for (const key of [requestId, crypto.randomUUID()]) {
      const result = await action(id, { action: "continueDeep", explicitNew: false, requestId: key }, scenario === "completed" ? 200 : 409);
      if (scenario !== "completed") assert.equal(result.code, "default_child_gone");
      else assert.equal(result.deepSession.id, child.id);
    }
    await action(id, { action: "continueDeep", explicitNew: true, idempotencyKey: crypto.randomUUID() });
    assert.equal(table(db.$client, "default_continuations").find(r => r.quick_attempt_id === id)!.deep_attempt_id, child.id);
  }
});

test("源卡片修改与删除不改变精练的冻结 cardSnapshot，删除后晚到保存不能重建源会话", async () => {
  const id = await create(); await save(id, 0);
  const child = (await action(id, { action: "continueDeep", explicitNew: false })).deepSession, snapshot = structuredClone(child.cardSnapshot);
  await save(id, 1, "后来改动");
  const another = (await action(id, { action: "continueDeep", explicitNew: true, idempotencyKey: crypto.randomUUID() })).deepSession;
  assert.equal(another.cardSnapshot.contentVersion, 2); assert.equal(another.cardSnapshot.content.parts[0].text, "后来改动");
  assert.deepEqual(getSession("u", child.id)!.cardSnapshot, snapshot);
  deleteSession("u", id); assert.deepEqual(getSession("u", child.id)!.cardSnapshot, snapshot);
  assert.throws(() => commitQuickMutation("u", id, { action: "cardSave", cardVersion: 2, parts: [] }), /不存在/);
  assert.equal(getSession("u", id), null);
});

test("开关：速刷关闭与题库关闭均创建 403、已有速刷 GET 和全部动作 409；开关打开恢复正常", async () => {
  const id = await create();
  for (const flag of ["QUICK_ENABLED", "QUESTION_BANK_ENABLED"]) {
    process.env[flag] = "false";
    try {
      assert.equal((await f.call("create", "", createBody())).status, 403);
      assert.equal((await f.call("quick", id)).status, 409);
      const before = f.snapshot();
      for (const name of ["cardSave", "cardExcerpt", "quickAnswer", "continueDeep", "quickFollowup", "quickCheck", "quickRetry", "quickSupplemental", "startWriting"]) {
        assert.equal((await action(id, { action: name }, 409)).code, "unsupported_session");
      }
      assert.equal((await f.call("patch", id, { version: 0, drafts: { original: "试写", revision: "" } })).status, 409);
      assert.deepEqual(f.snapshot(), before);
    } finally { process.env[flag] = "true"; }
  }
  assert.equal((await f.call("quick", id)).status, 200); await save(id, 0);
});

test("活动分派、所有者隔离与 Same Origin：速刷拒绝精练/PATCH，精练拒绝全部速刷动作，他人资源 404", async () => {
  const id = await create(), child = (await action(id, { action: "continueDeep", explicitNew: false })).deepSession;
  assert.equal((await action(id, { action: "startWriting" }, 409)).code, "unsupported_session");
  assert.equal((await f.call("patch", id, { version: 0 })).status, 409);
  for (const name of ["cardSave", "cardExcerpt", "quickAnswer", "continueDeep", "quickFollowup", "quickCheck", "quickRetry", "quickSupplemental"]) assert.equal((await action(child.id, { action: name }, 409)).code, "unsupported_session");
  assert.equal((await f.call("quick", child.id)).status, 409);
  // Both users exist: this must fail on the composite session/owner FK, not the users FK.
  assert.throws(() => db.$client.prepare("UPDATE topic_cards SET user_id='other' WHERE attempt_id=?").run(id));
  for (const kind of ["quick", "action"] as const) assert.equal((await f.call(kind, id, kind === "action" ? { action: "cardSave", cardVersion: 0, parts: [] } : undefined, "other")).status, 404);
  assert.equal((await f.call("action", id, { action: "cardSave", cardVersion: 0, parts: [] }, "u", "http://evil.test")).status, 403);
});

test("短事务：回执写失败时卡片、学生时间与新建精练全部回滚，不会二次 persist", async () => {
  const id = await create(), before = f.snapshot();
  db.$client.exec("CREATE TRIGGER fail_quick_receipt BEFORE INSERT ON request_receipts BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
  try {
    for (const input of [{ action: "cardSave" as const, cardVersion: 0, parts: [{ key: "reasons.answer", text: "要回滚" }] }, { action: "continueDeep" as const, explicitNew: false }]) {
      assert.throws(() => commitQuickMutation("u", id, { ...input, requestId: crypto.randomUUID() })); assert.deepEqual(f.snapshot(), before);
    }
  } finally { db.$client.exec("DROP TRIGGER fail_quick_receipt"); }
  db.$client.exec("CREATE TRIGGER fail_card_create BEFORE INSERT ON topic_cards BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
  try {
    assert.throws(() => createQuestionPractice("u", { questionId: "qb_mock_health_001", activity: "quick", mode: "practice", idempotencyKey: crypto.randomUUID() }));
    assert.deepEqual(f.snapshot(), before, "card insertion failure rolls back session, marker, familiarity and receipt");
  } finally { db.$client.exec("DROP TRIGGER fail_card_create"); }
});

test("Quick Sunday, continued Deep Monday：周日完成夹具与周一精练各归其周，只有精练自身反馈合同成功才新增精练事件", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-01T15:00:00.000Z") });
  const id = await create(); await save(id, 0); const sunday = getSession("u", id)!;
  assert.equal(table(db.$client, "completion_events").filter(e => e.attempt_id === id).length, 0, "WP4a save does not complete Quick");
  // WP4b check success is a fixture only; no production Quick completion path is introduced.
  db.update(topicCards).set({ state: "passed", lastCheckedVersion: 1 }).where(eq(topicCards.attemptId, id)).run();
  completed(id, "quick", sunday.createdAt);
  const before = table(db.$client, "completion_events");
  t.mock.timers.setTime(new Date("2026-11-01T16:30:00.000Z").getTime());
  const child = (await action(id, { action: "continueDeep", explicitNew: false })).deepSession;
  assert.equal(sunday.createdAt, "2026-11-01T15:00:00.000Z"); assert.equal(child.createdAt, "2026-11-01T16:30:00.000Z");
  assert.deepEqual(table(db.$client, "completion_events"), before);
  await action(child.id, { action: "startWriting" });
  let state = getSession("u", child.id)!;
  assert.equal((await f.call("patch", child.id, { version: state.version, drafts: { original: essay, revision: "" } })).status, 200);
  const blockedFetch = globalThis.fetch, key = process.env.LLM_API_KEY; let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response("fixture failure", { status: 503 }); };
  process.env.LLM_API_KEY = "offline-only";
  try {
    const failed = await f.call("action", child.id, { action: "evaluate", kind: "original", requestId: crypto.randomUUID() });
    assert.ok(failed.status >= 500); assert.deepEqual(table(db.$client, "completion_events"), before);
    globalThis.fetch = async () => { calls++; return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(evaluation) } }] }); };
    await action(child.id, { action: "evaluate", kind: "original", requestId: crypto.randomUUID() });
  } finally { globalThis.fetch = blockedFetch; process.env.LLM_API_KEY = key ?? ""; }
  assert.equal(calls, 2); state = getSession("u", child.id)!; assert.equal(state.stage, "feedback");
  const events = table(db.$client, "completion_events").filter(e => e.attempt_id === child.id || e.attempt_id === id);
  assert.equal(events.length, 2);
  const deepEvent = events.find(e => e.attempt_id === child.id)!;
  assert.equal(deepEvent.activity, "deep"); assert.equal(deepEvent.relation, "continuation"); assert.equal(deepEvent.completed_at, child.createdAt);
  assert.deepEqual(events.find(e => e.attempt_id === id), before.find(e => e.attempt_id === id));
  assert.equal(table(db.$client, "completion_events").length, before.length + 1, "only Deep earns a new credit");
  const weekday = new Intl.DateTimeFormat("en", { timeZone: "Asia/Taipei", weekday: "short" });
  assert.equal(weekday.format(new Date(sunday.createdAt)), "Sun"); assert.equal(weekday.format(new Date(child.completedAt ?? child.createdAt)), "Mon");
  assert.equal(getSession("u", id)!.completedAt, sunday.createdAt); assert.equal(getSession("u", id)!.createdAt, sunday.createdAt);
});


test("原题版本冻结：目录出现 v2 新要求后旧速刷仍用 v1 槽位且精练复制 v1 题干", async () => {
  const id = await create(), original = getSession("u", id)!;
  const row = db.select().from(questions).where(eq(questions.id, original.question!.id)).get()!;
  const requirement = JSON.parse(row.requirementsJson); requirement.version = 2;
  requirement.subquestions = [{ key: "new_requirement", en: "New question?", zh: "新版本要求" }];
  db.update(questions).set({ isCurrent: false }).where(eq(questions.id, row.id)).run();
  db.insert(questions).values({ ...row, version: 2, text: "Changed current catalog prompt?", requirementsJson: JSON.stringify(requirement), isCurrent: true }).run();
  try {
    await save(id, 0, "仍回应旧要求");
    await action(id, { action: "cardSave", cardVersion: 1, parts: [{ key: "new_requirement.answer", text: "新版本不能混入" }] }, 400);
    const child = (await action(id, { action: "continueDeep", explicitNew: false })).deepSession;
    assert.deepEqual(child.question, original.question); assert.equal(child.question.version, 1);
  } finally {
    db.delete(questions).where(eq(questions.version, 2)).run();
    db.update(questions).set({ isCurrent: true }).where(eq(questions.id, row.id)).run();
  }
});

test("删除速刷只删卡片、检查正文和冻结输入；保留操作/包/映射；账户删除清空全部用户表并隔离他人", async () => {
  const id = await create(); await save(id, 0);
  const child = (await action(id, { action: "continueDeep", explicitNew: false })).deepSession;
  seedQuickEvidence(db.$client, "u", id, time);
  const retained = ["quick_operations", "quick_packages", "default_continuations", "request_receipts"].map(name => table(db.$client, name));
  assert.equal((await f.call("delete", id)).status, 200);
  for (const name of ["topic_cards", "quick_check_results", "quick_operation_inputs"]) assert.equal(table(db.$client, name).filter(r => r.attempt_id === id).length, 0);
  assert.deepEqual(["quick_operations", "quick_packages", "default_continuations", "request_receipts"].map(name => table(db.$client, name)), retained);
  assert.deepEqual(getSession("u", child.id)!.cardSnapshot, child.cardSnapshot);
  const live = await create(); seedQuickEvidence(db.$client, "u", live, time);
  const otherResponse = await f.call("create", "", createBody(), "other"), other = (await otherResponse.json()).session;
  seedQuickEvidence(db.$client, "other", other.id, time);
  db.update(users).set({ passwordHash: await hashPassword("offline-password") }).where(eq(users.id, "u")).run();
  assert.equal((await f.call("account", "", { password: "offline-password", confirmation: "删除我的账户" })).status, 200);
  for (const name of ["writing_sessions", "auth_sessions", "attempt_markers", "completion_events", "familiarity", "legacy_scan", "default_continuations", "request_receipts", "topic_cards", "quick_check_results", "quick_operation_inputs", "quick_operations", "quick_packages", "llm_calls"]) assert.equal(table(db.$client, name).filter(r => r.user_id === "u").length, 0, name);
  assert.ok(getSession("other", other.id));
  for (const name of ["topic_cards", "quick_check_results", "quick_operation_inputs", "quick_operations", "quick_packages"]) assert.equal(table(db.$client, name).filter(r => r.user_id === "other").length, 1, name);
  assert.equal(db.$client.pragma("integrity_check", { simple: true }), "ok");
});
