import assert from "node:assert/strict";
import { test } from "node:test";
import { runAction } from "../lib/pipeline/engine";
import { createSession } from "../lib/pipeline/initial";
import { DEFAULT_PROFILE } from "../lib/auth/types";
import { readFeatures } from "../lib/config/features";
const profile = { ...DEFAULT_PROFILE, explainLanguage: "zh" as const };
const response = (out: unknown) => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(out) } }] }));
test("真实生成链：协议错误重试、提纲原话回退、hint 无引用且本轮升级", async () => {
 const oldFetch = globalThis.fetch, oldKey = process.env.LLM_API_KEY, oldFlag = process.env.TUTOR_V2_ENABLED;
 process.env.LLM_API_KEY = "fixture"; process.env.TUTOR_V2_ENABLED = "true";
 try {
  assert.equal(readFeatures().TUTOR_V2_ENABLED, true);
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
   const context = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
   assert.equal(context.newThread, true); assert.equal(context.thread.track, "argument");
   return response(++calls === 1 ? { invalid: true } : { move: "confirm", reply: "继续", help: { level: 0 }, track: "argument", delta: [{ op: "establish", text: "我支持公交", ref: "cur" }], payload: { outlineUpdates: [{ path: "stance", text: "invented paraphrase", source: "我支持公交" }] } });
  };
  let state = await runAction(createSession({ kind: "free", mode: "practice" }), { action: "prewrite", text: "我支持公交" }, () => {}, [], profile);
  assert.equal(calls, 2); assert.equal(state.outline.stance?.text, "我支持公交"); assert.equal(state.tutor?.threads.prewrite.established[0].text, "我支持公交");
  globalThis.fetch = async (_url, init) => {
   const context = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
   assert.equal(context.thread.allowedHelp, 1); assert.equal(context.refs.cur, undefined); assert.equal(context.intent, "more");
   assert.equal(context.newThread, false); assert.equal(context.thread.track, "argument");
   return response({ move: "hint", reply: "想想原因。", help: { level: 1 }, delta: [], payload: {} });
  };
  state = await runAction(state, { action: "prewrite", intent: "more", text: "" }, () => {}, [], profile);
  assert.equal(state.tutor?.threads.prewrite.allowedHelp, 1); assert.equal(state.messages.at(-2)?.action, "hint");
  const before = structuredClone(state);
  globalThis.fetch = async () => response({ invalid: true });
  await assert.rejects(runAction(state, { action: "prewrite", text: "继续" }, () => {}, [], profile)); assert.deepEqual(state, before);
 } finally { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = oldKey; if (oldFlag === undefined) delete process.env.TUTOR_V2_ENABLED; else process.env.TUTOR_V2_ENABLED = oldFlag; }
});
test("问题线程示范、采用权限、关闭和重新打开", async () => {
 const oldFetch = globalThis.fetch, oldKey = process.env.LLM_API_KEY, oldFlag = process.env.TUTOR_V2_ENABLED;
 process.env.LLM_API_KEY = "fixture"; process.env.TUTOR_V2_ENABLED = "true";
 try {
  let state = createSession({ kind: "free", mode: "practice" }); state.stage = "feedback"; state.submitted.original = "This seem easy."; state.issueLevels[1] = 2;
  state.evaluation = { scores: { overall: 6, dims: { TR: 6, CC: 6, LR: 6, GRA: 6 }, rationale: { TR: "x", CC: "x", LR: "x", GRA: "x" } }, issues: [{ rank: 1, code: "GRA", title: "主谓一致", why: "singular", hintL1: "检查谓语", sentenceIds: [1], recurring: false }], review: { outlineCoverage: [], breakthrough: null, focusResult: null, selfReportContrast: null, aiRatio: 0 } };
  globalThis.fetch = async (_url, init) => {
   const context = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
   assert.equal(context.newThread, true); assert.equal(Object.hasOwn(context.thread, "track"), false);
   return response({ move: "suggest", reply: "检查主谓一致。", help: { level: 3 }, track: "language", delta: [], payload: { suggestion: { suggestedText: "This seems easy.", reason: "单数" } } });
  };
  state = await runAction(state, { action: "issue", rank: 1, intent: "more" }, () => {}, [], profile);
  const id = Object.keys(state.suggestions)[0]; assert.equal(state.suggestions[id].type, "example"); assert.equal(state.issueLevels[1], 3);
  assert.equal(state.tutor?.threads["issue:1"].track, "language");
  await assert.rejects(runAction(state, { action: "suggestion", id, status: "accepted" }, () => {}));
  const dismissed = await runAction(state, { action: "suggestion", id, status: "dismissed" }, () => {}); assert.equal(dismissed.suggestions[id].status, "dismissed");
  state = await runAction(state, { action: "startRevision", openIssue: 1 }, () => {});
  state = await runAction(state, { action: "suggestion", id, status: "accepted" }, () => {}); assert.equal(state.suggestions[id].status, "accepted");
  globalThis.fetch = async (_url, init) => {
   const context = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
   assert.equal(context.intent, "attempt"); assert.equal(context.newThread, false); assert.equal(context.thread.track, "language");
   return response({ move: "check_attempt", reply: "正确。", help: { level: 0 }, delta: [{ op: "recordAttempt", ref: "cur", result: "met", reason: "动词正确" }, { op: "clearQuestion" }, { op: "close", reason: "met" }], payload: {} });
  };
  state = await runAction(state, { action: "issue", rank: 1, intent: "attempt", text: "This seems easy." }, () => {}, [], profile); assert.equal(state.tutor?.threads["issue:1"].status, "closed");
  globalThis.fetch = async () => response({ move: "confirm", reply: "可以继续", help: { level: 0 }, delta: [], payload: {} });
  state = await runAction(state, { action: "issue", rank: 1, intent: "ask", text: "还有什么？" }, () => {}, [], profile); assert.equal(state.tutor?.threads["issue:1"].status, "open");
  process.env.TUTOR_V2_ENABLED = "false"; globalThis.fetch = async () => response({ reply: "旧提示", suggestions: [] });
  state = await runAction(state, { action: "issue", rank: 1, intent: "more" }, () => {}, [], profile);
  process.env.TUTOR_V2_ENABLED = "true"; globalThis.fetch = async () => response({ move: "confirm", reply: "已对齐", help: { level: 0 }, delta: [], payload: {} });
  state = await runAction(state, { action: "issue", rank: 1, intent: "ask", text: "继续" }, () => {}, [], profile); assert.equal(state.tutor?.threads["issue:1"].allowedHelp, 3);
 } finally { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = oldKey; if (oldFlag === undefined) delete process.env.TUTOR_V2_ENABLED; else process.env.TUTOR_V2_ENABLED = oldFlag; }
});
test("真实生成链 hint 可设置一个问题且只提交一次，多个问题仍整批拒绝", async () => {
 const oldFetch = globalThis.fetch, oldKey = process.env.LLM_API_KEY, oldFlag = process.env.TUTOR_V2_ENABLED;
 process.env.LLM_API_KEY = "fixture"; process.env.TUTOR_V2_ENABLED = "true";
 try {
  const state = createSession({ kind: "free", mode: "practice" });
  const before = structuredClone(state);
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
   calls++;
   assert.deepEqual(state, before);
   const body = JSON.parse(String(init?.body));
   assert.equal(body.messages[0].content.includes("Previous response was invalid"), false);
   return response({ move: "hint", reply: "你更看重哪一点？", help: { level: 1 }, track: "argument", delta: [{ op: "ask", text: "你更看重哪一点？" }], payload: {} });
  };
  const next = await runAction(state, { action: "prewrite", intent: "more", text: "" }, () => {}, [], profile);
  assert.equal(calls, 1); assert.equal(next.prewriteTurns, 1);
  assert.equal(next.messages.length - before.messages.length, 2);
  assert.equal(next.tutor?.helpEvents.length, 1);
  assert.equal(next.tutor?.threads.prewrite.allowedHelp, 1);
  assert.equal(next.tutor?.threads.prewrite.openQuestion?.text, "你更看重哪一点？");
  const saved = structuredClone(next);
  globalThis.fetch = async () => response({ move: "hint", reply: "你更看重哪一点？", help: { level: 1 }, delta: [{ op: "ask", text: "你更看重哪一点？" }, { op: "ask", text: "为什么？" }], payload: {} });
  await assert.rejects(runAction(next, { action: "prewrite", intent: "more", text: "" }, () => {}, [], profile));
  assert.deepEqual(next, saved);
 } finally { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = oldKey; if (oldFlag === undefined) delete process.env.TUTOR_V2_ENABLED; else process.env.TUTOR_V2_ENABLED = oldFlag; }
});
