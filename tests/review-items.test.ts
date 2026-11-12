import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession } from "../lib/pipeline/initial";
import { dueItems, matchRevision, nextReview, reviewItems } from "../lib/learning/review-items";
import { draftMarks, remainingByIssue } from "../lib/learning/revision-marks";

function practised() {
  const session = createSession({ kind: "free", mode: "practice" });
  session.submitted.original = "He go to school every day. The rent is expensive.\n\nStudents feels homesick.";
  session.submitted.revision = "He goes to school every day. The rent is expensive.\n\nSome students feel homesick at first.";
  session.evaluation = { scores: { overall: 6, dims: { TR: 6, CC: 6, LR: 6, GRA: 6 }, rationale: { TR: "", CC: "", LR: "", GRA: "" } },
    issues: [{ rank: 1, code: "sva", title: "主谓一致", why: "", sentenceIds: [1, 3], hintL1: "先找主语", recurring: false }],
    review: { outlineCoverage: [], breakthrough: null, focusResult: null, selfReportContrast: null, aiRatio: 0 } };
  session.messages.push({ id: "u1", role: "user", stage: "writing", action: "express", content: "没人管之后学习变差" }, { id: "c1", role: "coach", stage: "writing", action: "express", content: "可以这样说", suggestionIds: ["s1", "s2"] });
  session.suggestions = { s1: { id: "s1", type: "express", selectionText: "", suggestedText: "Without supervision, their studies get worse.", reason: "直接对应", status: "accepted" }, s2: { id: "s2", type: "express", selectionText: "", suggestedText: "Unused.", reason: "", status: "dismissed" } };
  return session;
}

test("复习内容只来自学生自己的练习：采纳的表达配上原来的中文，被指出的句子配上自己的改法", () => {
  const session = practised();
  const items = reviewItems([session]);
  const phrase = items.filter(item => item.kind === "phrase");
  assert.equal(phrase.length, 1);
  assert.equal(phrase[0].prompt, "没人管之后学习变差"); assert.equal(phrase[0].answer, "Without supervision, their studies get worse.");
  const fixes = items.filter(item => item.kind === "fix");
  assert.deepEqual(fixes.map(item => item.prompt), ["He go to school every day.", "Students feels homesick."]);
  assert.equal(fixes[0].answer, "He goes to school every day.");
  assert.equal(fixes[1].answer, "Some students feel homesick at first.");
  session.submitted.revision = null;
  assert.equal(reviewItems([session]).find(item => item.kind === "fix")!.answer, null);
});

test("没改动的句子、完全无关的句子都不算“改法”", () => {
  assert.equal(matchRevision("The rent is expensive.", ["The rent is expensive.", "Other text here."]), null);
  assert.equal(matchRevision("He go to school.", ["Technology changes quickly these days."]), null);
});

test("排期：新内容立即到期，记住后间隔拉长，没记住回到当天", () => {
  const items = reviewItems([practised()]), now = new Date("2026-11-10T00:00:00Z");
  assert.equal(dueItems(items, {}, now).length, items.length);
  const first = nextReview(undefined, "good", now);
  assert.deepEqual(first, { box: 1, due: "2026-11-11T00:00:00.000Z" });
  assert.equal(nextReview(first, "good", now).due, "2026-11-13T00:00:00.000Z");
  assert.deepEqual(nextReview({ box: 4 }, "again", now), { box: 0, due: now.toISOString() });
  assert.equal(dueItems(items, { [items[0].id]: first }, now).length, items.length - 1);
  assert.equal(dueItems(items, { [items[0].id]: first }, new Date("2026-11-11T00:00:01Z")).length, items.length);
});

test("改写稿里的标记：只标还原样留着的问题句，改过的不再标", () => {
  const issues = [{ rank: 1, sentenceIds: [1, 3] }, { rank: 2, sentenceIds: [2, 3] }];
  const original = "He go to school every day. The rent is expensive.\n\nStudents feels homesick.";
  const untouched = draftMarks(original, original, issues);
  assert.deepEqual(untouched.map(m => [m.sentenceId, m.rank]), [[1, 1], [2, 2], [3, 1]]);
  assert.equal(original.slice(untouched[0].start, untouched[0].end), "He go to school every day.");
  const edited = original.replace("He go", "He goes");
  const marks = draftMarks(original, edited, issues);
  assert.deepEqual(marks.map(m => m.sentenceId), [2, 3]);
  assert.deepEqual(remainingByIssue(marks, issues), [{ rank: 1, total: 2, remaining: 1 }, { rank: 2, total: 2, remaining: 2 }]);
});
