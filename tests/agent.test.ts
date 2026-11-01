import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { ModelError, parseModelJson } from "../lib/llm/json";
import { generateJson } from "../lib/llm/client";
import { createSession } from "../lib/pipeline/initial";
import { runAction } from "../lib/pipeline/engine";
import { actionSchema, draftSchema, scoresSchema } from "../lib/pipeline/schemas";

const reply = z.object({ reply: z.string().min(1) });
test("model output rejects truncated JSON and wrong types", () => {
  assert.throws(() => parseModelJson('{"reply":', reply), ModelError);
  assert.throws(() => parseModelJson('{"reply":99}', reply), ModelError);
  assert.equal(parseModelJson('```json\n{"reply":"ok"}\n```', reply).reply, "ok");
});
test("schemas reject forged state fields and invalid scores", () => {
  assert.equal(draftSchema.safeParse({ version: 0, evaluation: { scores: { overall: 9 } } }).success, false);
  assert.equal(draftSchema.safeParse({ version: 0, userId: "someone-else" }).success, false);
  assert.equal(actionSchema.safeParse({ action: "jumpTo", stage: "finished" }).success, false);
  assert.equal(scoresSchema.safeParse({ overall: 99, dims: {}, rationale: {} }).success, false);
});
test("new sessions have unique ids and assessment cannot enable coaching", async () => {
  const a = createSession({ kind: "assessment", mode: "practice" });
  const b = createSession({ kind: "assessment", mode: "practice" });
  assert.notEqual(a.id, b.id); assert.equal(a.mode, "mock");
  await assert.rejects(runAction(a, { action: "chat", text: "help" }, () => {}), /模考/);
  await assert.rejects(runAction(a, { action: "finish" }, () => {}), /当前阶段/);
});
test("selection must belong to persisted draft", async () => {
  const session = createSession({ kind: "free", mode: "practice" }); session.stage = "writing";
  session.drafts.original = "This is my actual draft.";
  await assert.rejects(runAction(session, { action: "polish", selection: "not in the draft" }, () => {}), /原文已经变化/);
});
test("model client repairs malformed output once and keeps authentication errors private", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.LLM_API_KEY;
  process.env.LLM_API_KEY = "test-key-never-disclose";
  let calls = 0;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: ++calls === 1 ? '{"reply":' : '{"reply":"repaired"}' } }] }), { status: 200 });
    assert.deepEqual(await generateJson("test", {}, reply), { reply: "repaired" });
    assert.equal(calls, 2);
    globalThis.fetch = async () => new Response("test-key-never-disclose upstream details", { status: 401 });
    await assert.rejects(generateJson("test", {}, reply), error => error instanceof ModelError && error.message.includes("认证失败") && !error.message.includes("test-key"));
  } finally { globalThis.fetch = previousFetch; if (previousKey === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = previousKey; }
});
test("evaluation failure checkpoints the submitted essay for recovery", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.LLM_API_KEY;
  process.env.LLM_API_KEY = "test-only";
  const session = createSession({ kind: "assessment", mode: "mock" });
  session.drafts.original = "Public transport can improve the lives of residents because it reduces traffic and makes daily travel cheaper. For example, a reliable bus network allows students to reach their classes without buying a car. Local authorities should therefore invest in frequent services and safe stations. These investments also support shops by making neighbourhoods easier to visit.";
  let checkpoint = session;
  try {
    globalThis.fetch = async () => new Response("upstream failure", { status: 503 });
    await assert.rejects(runAction(session, { action: "evaluate", kind: "original" }, value => { checkpoint = structuredClone(value); }), ModelError);
    assert.equal(checkpoint.submitted.original, session.drafts.original);
    assert.equal(checkpoint.stage, "evaluating");
    assert.match(checkpoint.evalError ?? "", /暂时不可用/);
    assert.equal(checkpoint.evaluation, null);
  } finally { globalThis.fetch = previousFetch; if (previousKey === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = previousKey; }
});
test("prewriting only accepts outline updates grounded in the student's own words", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.LLM_API_KEY;
  process.env.LLM_API_KEY = "test-only";
  const session = createSession({ kind: "free", mode: "practice" });
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ reply: "为什么？", updates: [{ path: "stance", text: "我支持公共交通", source: "我支持公共交通" }, { path: "reasons.0.example", text: "我在伦敦生活了十年", source: "我在伦敦生活了十年" }] }) } }] }));
    const result = await runAction(session, { action: "prewrite", text: "我支持公共交通" }, () => {});
    assert.equal(result.outline.stance?.text, "我支持公共交通");
    assert.equal(result.outline.reasons[0].example, null);
    assert.equal(result.messages.at(-1)?.content, "为什么？");
  } finally { globalThis.fetch = previousFetch; if (previousKey === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = previousKey; }
});
test("provider billing denial becomes actionable text without upstream details", async () => {
  const { providerError } = await import("../lib/llm/json");
  const error = providerError(400, { error: { type: "invalid_request_error", message: "Access denied, please make sure your account is in good standing. https://help.aliyun.com/example#overdue-payment secret-account-123" } });
  assert.match(error.message, /检查额度或账户状态/);
  assert.match(error.message, /作文已保存/);
  assert.doesNotMatch(error.message, /aliyun|secret-account|Access denied/);
});
test("late responses cannot replace newer server state or local unsaved text", async () => {
  const { mergeSessionState } = await import("../lib/pipeline/client-state");
  const local = createSession({ kind: "free", mode: "practice" });
  local.version = 5;
  local.drafts.original = "new local work";
  const remote = structuredClone(local); remote.version = 6; remote.drafts.original = "previously saved work";
  remote.outline.stance = { text: "new server outline", sources: ["user"] };
  const result = mergeSessionState(local, remote, { original: 4, revision: 0, outline: 0, nudgesEnabled: 0 }, 3);
  assert.equal(result.drafts.original, "new local work");
  assert.equal(result.outline.stance?.text, "new server outline");
  assert.equal(result.version, 6);
  const stale = { ...remote, version: 4 };
  assert.equal(mergeSessionState(local, stale, { original: 0, revision: 0, outline: 0, nudgesEnabled: 0 }, 0), local);
});
test("manual outline edits are preserved without discarding server draft changes", async () => {
  const { mergeSessionState } = await import("../lib/pipeline/client-state");
  const local = createSession({ kind: "free", mode: "practice" });
  local.outline.stance = { text: "edited by the student", sources: ["user edit"] };
  const remote = structuredClone(local); remote.version = 1; remote.outline.stance = null; remote.drafts.revision = "new revision copy";
  const result = mergeSessionState(local, remote, { original: 0, revision: 0, outline: 2, nudgesEnabled: 0 }, 1);
  assert.equal(result.outline.stance?.text, "edited by the student");
  assert.equal(result.drafts.revision, "new revision copy");
});
