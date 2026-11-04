import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { applyDelta, escalate, fromLegacy, openThread, reconcileLegacy, reopenThread, syncIssueLevels, threadView } from "../lib/tutor/thread";
import { readTutorState, tutorOutputSchema } from "../lib/tutor/schemas";
import type { TutorOutput } from "../lib/tutor/types";
const jsonShape = (outputSchema: z.ZodType<TutorOutput>) => z.object({ type: z.literal("object"), properties: z.record(z.string(), z.unknown()), required: z.array(z.string()), additionalProperties: z.literal(false) }).parse(z.toJSONSchema(outputSchema));
const deltaOps = (value: unknown) => z.object({ items: z.object({ oneOf: z.array(z.object({ properties: z.object({ op: z.object({ const: z.string() }) }) })) }) }).parse(value).items.oneOf.map(op => op.properties.op.const);
const enumValues = (value: unknown) => z.object({ enum: z.array(z.string()) }).parse(value).enum;
const base: TutorOutput = { move: "confirm", reply: "对", help: { level: 0 }, delta: [], payload: {} };
const refs = { cur: { messageId: "u1", text: "This seems easy." } };
const t = openThread("issue:1", "language");
const schema = (thread = t, newThread = false) => tutorOutputSchema({ thread, refKeys: refs, allowOutline: thread.key === "prewrite", newThread });
test("线程上限、旧记录对齐与重新打开", () => {
 assert.equal(escalate(escalate(escalate(openThread("prewrite", "argument")))).allowedHelp, 2);
 assert.equal(escalate(fromLegacy("issue:1", "language", 3)).allowedHelp, 3);
 const changed = reconcileLegacy({ ...t, providedHelp: 1, openQuestion: { text: "why", askedMessageId: "c" } }, "legacy", 3);
 assert.equal(changed.allowedHelp, 3); assert.equal(changed.providedHelp, null); assert.equal(changed.openQuestion, null);
 assert.equal(syncIssueLevels({}, changed)[1], 3); assert.equal(reopenThread({ ...changed, status: "closed", closedReason: "met" }).closedReason, null);
});
test("合法核验关闭原子提交；confirm 无法关闭", () => {
 const out = { ...base, move: "check_attempt" as const, delta: [{ op: "recordAttempt" as const, ref: "cur", result: "met" as const, reason: "正确" }, { op: "clearQuestion" as const }, { op: "close" as const, reason: "met" as const }] };
 const next = applyDelta(t, schema().parse(out), { refs, coachMessageId: "c1" });
 assert.equal(next.status, "closed"); assert.equal(t.status, "open"); assert.equal(next.attempts.length, 1);
 assert.equal(schema().safeParse({ ...out, move: "confirm" }).success, false);
 assert.equal(schema(next).safeParse(out).success, false);
});
test("非法整批增量拒绝且原线程不变", () => {
 const out = { ...base, delta: [{ op: "establish" as const, text: "This", ref: "cur" }, { op: "retract" as const, establishedId: "missing", ref: "cur" }] };
 assert.equal(schema().safeParse(out).success, false); assert.equal(t.established.length, 0);
 assert.equal(schema().safeParse({ ...base, delta: [{ op: "establish", text: "invented", ref: "cur" }] }).success, false);
});
test("示范卡片权限、track 与无文字 hint 引用限制", () => {
 const out = { ...base, move: "suggest", help: { level: 3 }, payload: { suggestion: { suggestedText: "This seems easy.", reason: "agreement" } } };
 assert.equal(schema().safeParse(out).success, false); assert.equal(schema(escalate(escalate(t))).safeParse(out).success, true);
 assert.equal(schema().safeParse({ ...out, move: "explain" }).success, false);
 assert.equal(schema(t, true).safeParse(base).success, false);
 const noRefs = tutorOutputSchema({ thread: t, refKeys: {}, allowOutline: false, newThread: false });
 assert.equal(noRefs.safeParse({ ...base, delta: [{ op: "establish", text: "This", ref: "cur" }] }).success, false);
});
test("确认项 FIFO 归档，历史保留但不进入视图", () => {
 let state = t;
 for (let i = 0; i < 10; i++) state = applyDelta(state, { ...base, delta: [{ op: "establish", text: "This", ref: "cur" }] }, { refs, coachMessageId: `c${i}` });
 assert.equal(state.established.length, 10); assert.equal(threadView(state).established.length, 8); assert.equal(state.established[0].archived, true);
});
test("状态缺失可读，未来或损坏版本保留原值并拒绝", () => {
 assert.equal(readTutorState(undefined), null); const future = { v: 2, opaque: "x" }; assert.throws(() => readTutorState(future)); assert.deepEqual(future, { v: 2, opaque: "x" });
 assert.throws(() => readTutorState({ v: 1 })); assert.ok(readTutorState({ v: 1, brief: null, activeThread: null, threads: {}, helpEvents: [] }));
});
test("模型可见的单对象 schema 显式区分首轮与后续轮权限", () => {
 const prewrite = openThread("prewrite", "argument");
 const first = jsonShape(schema(prewrite, true));
 const later = jsonShape(schema(prewrite));
 assert.ok(first.required.includes("track"));
 assert.deepEqual(first.properties.track, { type: "string", const: "argument", description: "Declare the track on this first thread response only; omit on later turns." });
 assert.equal(later.properties.track, undefined);
 assert.deepEqual(enumValues(first.properties.move), ["ask", "clarify", "explain", "hint", "confirm", "invite_write"]);
 assert.equal(JSON.stringify(first.properties.help).includes('"const":3'), false);
 assert.equal(JSON.stringify(first.properties.payload).includes('"suggestion"'), false);
 assert.equal(deltaOps(first.properties.delta).includes("recordAttempt"), false);
 assert.equal(schema(prewrite).safeParse({ ...base, track: "argument" }).success, false);
 assert.equal(schema(prewrite, true).safeParse({ ...base, track: "argument" }).success, true);
});
test("模型可见 schema 限定引用和示范权限，无本轮文本不可核验", () => {
 const issue = jsonShape(schema(t, true));
 assert.ok(issue.required.includes("track"));
 assert.deepEqual(enumValues(issue.properties.track), ["argument", "language"]);
 assert.equal(JSON.stringify(issue.properties.payload).includes('"outlineUpdates"'), false);
 assert.equal(JSON.stringify(issue.properties.payload).includes('"suggestion"'), false);
 assert.equal(enumValues(issue.properties.move).includes("suggest"), false);
 const hint = jsonShape(tutorOutputSchema({ thread: t, refKeys: {}, allowOutline: false, newThread: false }));
 assert.equal(enumValues(hint.properties.move).includes("check_attempt"), false);
 for (const op of ["establish", "retract", "recordAttempt", "close"]) assert.equal(deltaOps(hint.properties.delta).includes(op), false);
 const withRef = jsonShape(tutorOutputSchema({ thread: t, refKeys: { "m:student": refs.cur }, allowOutline: false, newThread: false }));
 assert.ok(JSON.stringify(withRef.properties.delta).includes('"enum":["m:student"]'));
 const advanced = jsonShape(schema(escalate(escalate(t))));
 assert.ok(enumValues(advanced.properties.move).includes("suggest"));
 assert.ok(JSON.stringify(advanced.properties.payload).includes('"suggestion"'));
});
test("单个问题更新独立于教学动作，帮助权限与引用约束不变", () => {
 const delta = [{ op: "ask" as const, text: "What do you mean?" }];
 for (const thread of [openThread("prewrite", "argument"), t, escalate(escalate(t))]) {
  const outputSchema = schema(thread);
  const visible = jsonShape(outputSchema);
  assert.ok(deltaOps(visible.properties.delta).includes("ask"));
  for (const move of enumValues(visible.properties.move)) {
   const out = { ...base, move, delta, ...(move === "suggest" ? { help: { level: 3 }, payload: { suggestion: { suggestedText: "This seems easy.", reason: "agreement" } } } : {}) };
   assert.equal(outputSchema.safeParse(out).success, true, move);
   assert.equal(outputSchema.safeParse({ ...out, delta: [...delta, ...delta] }).success, false, move);
  }
 }
 assert.equal(schema(t).safeParse({ ...base, move: "hint", help: { level: 2 }, delta }).success, false);
 assert.equal(schema(t).safeParse({ ...base, move: "hint", delta: [...delta, { op: "establish", text: "This", ref: "missing" }] }).success, false);
 const onlyHint = tutorOutputSchema({ thread: t, refKeys: refs, allowOutline: false, newThread: false, allowedMoves: ["hint"] });
 assert.equal(onlyHint.safeParse({ ...base, move: "hint", delta }).success, true);
 assert.equal(onlyHint.safeParse({ ...base, move: "clarify", delta }).success, false);
});
test("核验未关闭时可留问题，关闭与任意顺序的新问题互斥", () => {
 const attempt = { op: "recordAttempt" as const, ref: "cur", result: "met" as const, reason: "correct" };
 const ask = { op: "ask" as const, text: "What next?" };
 assert.equal(schema().safeParse({ ...base, move: "check_attempt", delta: [attempt, ask] }).success, true);
 assert.equal(schema().safeParse({ ...base, move: "hint", delta: [attempt, ask] }).success, false);
 const close = [{ op: "clearQuestion" as const }, { op: "close" as const, reason: "met" as const }];
 for (const delta of [[ask, attempt, ...close], [attempt, ...close, ask]]) assert.equal(schema().safeParse({ ...base, move: "check_attempt", delta }).success, false);
 const closed = applyDelta(t, schema().parse({ ...base, move: "check_attempt", delta: [attempt, ...close] }), { refs, coachMessageId: "c1" });
 assert.equal(closed.status, "closed"); assert.equal(closed.openQuestion, null);
 const damaged = { v: 1, brief: null, activeThread: t.key, threads: { [t.key]: { ...closed, openQuestion: { text: "invalid", askedMessageId: "c1" } } }, helpEvents: [] };
 const before = structuredClone(damaged);
 assert.throws(() => readTutorState(damaged), { status: 409 });
 assert.deepEqual(damaged, before);
});
