import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { quickFixture } from "../tests/helpers/quick-api";
import { seedQuickEvidence } from "../tests/helpers/quick-records";
import { table } from "../tests/helpers/practice-db";
import { getSession } from "../lib/db/queries/sessions";
import { getCard } from "../lib/db/queries/cards";
import { hashPassword } from "../lib/auth/password";
import { users } from "../lib/db/schema";

async function main() {
  assert.equal(process.env.LLM_API_KEY, "");
  globalThis.fetch = async () => { throw new Error("Network/model disabled in E2E"); };
  const f = quickFixture(), output = resolve("docs/plans/reports/WP4a_e2e");
  const evidence: unknown[] = [];
  const record = (label: string, response: unknown) => { evidence.push({ label, response, database: f.snapshot() }); console.log(`PASS ${label}`); };
  const call = async (label: string, kind: Parameters<typeof f.call>[0], id: string, body?: unknown, expected = 200) => {
    const response = await f.call(kind, id, body), payload = await response.json();
    assert.equal(response.status, expected, JSON.stringify(payload)); record(label, { status: response.status, body: payload }); return payload;
  };
  const render = (id: string, label: string) => {
    const before = f.snapshot();
    const log = execFileSync(process.execPath, ["--import", "tsx", resolve(output, "render.mjs"), id, label], {
      env: { ...process.env, DATABASE_PATH: f.filename, LLM_API_KEY: "" }, encoding: "utf8",
    });
    assert.deepEqual(f.snapshot(), before, "rendering must not mutate content or student timestamps");
    console.log(log.trim()); record(`页面 ${label}`, { html: `${label}.html`, unchangedDatabase: true });
  };
  try {
    const created = await call("按题创建速刷", "create", "", { questionId: "qb_mock_health_001", activity: "quick", mode: "practice", idempotencyKey: crypto.randomUUID() }, 201);
    const id = created.session.id;
    assert.equal(created.session.stage, "quick"); assert.deepEqual(getCard("u", id)!.content.parts, []);
    await call("保存卡片", "action", id, { action: "cardSave", cardVersion: 0, parts: [{ key: "reasons.answer", text: "最初保存的原因" }], requestId: crypto.randomUUID() });
    record("夹具注入一条教练追问（非模型）", f.followup(id));
    const answer = await call("学生回答", "action", id, { action: "quickAnswer", text: "回答里的原话解释了原因😀", requestId: crypto.randomUUID() });
    const message = answer.session.messages.at(-1);
    assert.equal(message.afterFollowUp, 1); assert.equal(message.userId, "u");
    await call("摘取本人原话", "action", id, { action: "cardExcerpt", cardVersion: 1, key: "reasons.why", messageId: message.id, start: 0, end: message.content.length });
    const first = await call("默认写成作文", "action", id, { action: "continueDeep", explicitNew: false, requestId: crypto.randomUUID() });
    const child = first.deepSession;
    const second = await call("换请求 ID 再点打开同一篇", "action", id, { action: "continueDeep", explicitNew: false, requestId: crypto.randomUUID() });
    assert.equal(second.deepSession.id, child.id);
    const explicitKey = crypto.randomUUID();
    const another = await call("明确另开一次", "action", id, { action: "continueDeep", explicitNew: true, idempotencyKey: explicitKey });
    assert.notEqual(another.deepSession.id, child.id);
    const retry = await call("另开请求响应丢失后重放", "action", id, { action: "continueDeep", explicitNew: true, idempotencyKey: explicitKey, requestId: crypto.randomUUID() });
    assert.equal(retry.deepSession.id, another.deepSession.id);
    await call("修改源卡片", "action", id, { action: "cardSave", cardVersion: 2, parts: [{ key: "reasons.answer", text: "后来修改的源卡片" }] });
    assert.deepEqual(getSession("u", child.id)!.cardSnapshot, child.cardSnapshot);
    const read = await call("GET quick 恢复", "quick", id); assert.deepEqual(read.operations, []); assert.equal(read.budget, null);
    assert.equal(table(f.db.$client, "completion_events").length, 0, "WP4a never completes a Quick or its new child");
    assert.equal(table(f.db.$client, "llm_calls").length, 0);
    render(child.id, "deep-prewriting");
    await call("子练习进入写作", "action", child.id, { action: "startWriting", requestId: crypto.randomUUID() });
    render(child.id, "deep-writing"); render(id, "quick-enabled");
    process.env.QUICK_ENABLED = "false"; render(id, "quick-disabled"); process.env.QUICK_ENABLED = "true";
    seedQuickEvidence(f.db.$client, "u", id, new Date().toISOString());
    record("夹具填入其余四张表以验证删除", { fixtureOnly: true });
    await call("删除源速刷", "delete", id);
    for (const name of ["topic_cards", "quick_check_results", "quick_operation_inputs"]) assert.equal(table(f.db.$client, name).length, 0, name);
    for (const name of ["quick_operations", "quick_packages", "default_continuations"]) assert.equal(table(f.db.$client, name).length, 1, name);
    assert.deepEqual(getSession("u", child.id)!.cardSnapshot, child.cardSnapshot);
    render(child.id, "deep-source-deleted");
    // Keep a live Quick so account deletion tests every content cascade with actual rows.
    const live = await call("账户删除前新建存活速刷", "create", "", { questionId: "qb_mock_health_001", activity: "quick", mode: "practice", idempotencyKey: crypto.randomUUID() }, 201);
    seedQuickEvidence(f.db.$client, "u", live.session.id, new Date().toISOString());
    f.db.update(users).set({ passwordHash: await hashPassword("offline-password") }).where(eq(users.id, "u")).run();
    await call("真实账户删除路由", "account", "", { password: "offline-password", confirmation: "删除我的账户" });
    const tables = ["auth_sessions", "writing_sessions", "topic_cards", "quick_check_results", "quick_operation_inputs", "quick_operations", "quick_packages", "attempt_markers", "completion_events", "familiarity", "legacy_scan", "default_continuations", "request_receipts", "llm_calls"];
    for (const name of tables) assert.equal(table(f.db.$client, name).filter(r => r.user_id === "u").length, 0, name);
    assert.equal(f.db.$client.pragma("integrity_check", { simple: true }), "ok");
    assert.equal(table(f.db.$client, "questions").length, 38);
    writeFileSync(resolve(output, "summary.json"), JSON.stringify({ passed: true, routeAndFixtureSteps: evidence.length, pageRenders: 5, tablesClearedForDeletedOwner: tables, networkCalls: 0, realModelCalls: 0, integrityCheck: "ok", fixtureDatabaseRemovedOnExit: true }, null, 2) + "\n");
  } finally {
    writeFileSync(resolve(output, "steps-and-database.json"), JSON.stringify(evidence, null, 2) + "\n"); f.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
