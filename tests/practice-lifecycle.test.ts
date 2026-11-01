import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession } from "../lib/pipeline/initial";
import { actionSchema, createSessionSchema, finishSchema } from "../lib/pipeline/schemas";
import { isStudentAction } from "../lib/rules/student-action";
import { nextLifecycle } from "../lib/rules/lifecycle";

test("student recency: actual draft/outline text and student actions count; reads, automatic nudge/review and metadata do not", () => {
  const before = createSession({ kind: "free", mode: "practice" });
  const after = structuredClone(before);
  assert.equal(isStudentAction({ kind: "draft", before, after }), false);
  after.outline.userEdited = true;
  assert.equal(isStudentAction({ kind: "draft", before, after }), false);
  after.drafts.original = "Changed";
  assert.equal(isStudentAction({ kind: "draft", before, after }), true);
  after.drafts.original = ""; after.drafts.revision = "Revision";
  assert.equal(isStudentAction({ kind: "draft", before, after }), true);
  after.drafts.revision = ""; after.outline.stance = { text: "My position", sources: [] };
  assert.equal(isStudentAction({ kind: "draft", before, after }), true);
  for (const kind of ["read", "automaticReview"] as const) assert.equal(isStudentAction({ kind }), false);
  assert.equal(isStudentAction({ kind: "lifecycle" }), true);
  // Check every action in the real schema, including future additions.
  for (const option of actionSchema.options) {
    for (const action of ("options" in option.shape.action ? option.shape.action.options : option.shape.action.values)) assert.equal(isStudentAction({ kind: "action", action }), action !== "nudge", action);
  }
});
test("lifecycle matrix: open/set-aside close, closed resume, same-state idempotence, closed cannot set aside", () => {
  assert.deepEqual(["open", "set_aside", "closed"].map(s => ["setAside", "resume", "close"].map(a => nextLifecycle(s as "open", a as "close"))), [
    ["set_aside", "open", "closed"], ["set_aside", "open", "closed"], [null, "open", "closed"],
  ]);
});
test("creation schema distinguishes strict question and legacy bodies; finish strips retired planChange", () => {
  assert.equal(createSessionSchema.safeParse({}).success, true);
  const input = { questionId: "q", activity: "deep", mode: "practice", idempotencyKey: "key" };
  assert.equal(createSessionSchema.safeParse(input).success, true);
  for (const extra of [{ kind: "free" }, { prompt: "A pasted prompt mixed with question ID" }, { userId: "other" }]) assert.equal(createSessionSchema.safeParse({ ...input, ...extra }).success, false);
  assert.deepEqual(finishSchema.parse({ memoryChanges: [{ kind: "new", text: "实际证据" }], planChange: "旧计划" }), { memoryChanges: [{ kind: "new", text: "实际证据" }] });
});
