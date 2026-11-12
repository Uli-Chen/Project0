import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession } from "../lib/pipeline/initial";
import { dueItems, gradeReview, GRADED_KEYS, matchRevision, nextReview, reviewItems } from "../lib/learning/review-items";
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

test("提交改写稿后，没改的错句仍留在复习里：同一个 id，answer 为 null，已有进度不丢", () => {
  const session = practised();
  session.submitted.revision = null;
  const before = reviewItems([session]).filter(item => item.kind === "fix");
  assert.deepEqual(before.map(item => item.id), [`fix:${session.id}:1`, `fix:${session.id}:3`]);
  const now = new Date("2026-11-10T00:00:00Z");
  const state = { [before[0].id]: nextReview(undefined, "good", now) };
  // Only the third sentence is rewritten; the first one is left exactly as it was.
  session.submitted.revision = "He go to school every day. The rent is expensive.\n\nSome students feel homesick at first.";
  const after = reviewItems([session]).filter(item => item.kind === "fix");
  assert.deepEqual(after.map(item => item.id), before.map(item => item.id));
  assert.equal(after[0].kind === "fix" && after[0].answer, null);
  assert.equal(after[0].kind === "fix" && after[0].revised, true);
  assert.equal(after[1].answer, "Some students feel homesick at first.");
  assert.equal(dueItems(after, state, now).length, after.length - 1, "progress keyed by id survives the revision");
  // A rewrite that leaves nothing matching still removes no card.
  session.submitted.revision = "Completely different text about technology.";
  assert.deepEqual(reviewItems([session]).filter(item => item.kind === "fix").map(item => [item.id, item.answer]), before.map(item => [item.id, null]));
});

test("评分重试：同一次呈现的评分只推进一次；下一次呈现照常推进", () => {
  const now = new Date("2026-11-10T00:00:00Z");
  const first = gradeReview(undefined, "good", "shown-1", now);
  assert.equal(first.applied, true);
  assert.deepEqual({ box: first.entry.box, due: first.entry.due }, { box: 1, due: "2026-11-11T00:00:00.000Z" });
  const retry = gradeReview(first.entry, "good", "shown-1", now);
  assert.equal(retry.applied, false);
  assert.deepEqual(retry.entry, first.entry, "a retried grade must not move 1 day to 3 days");
  // Even if the retry carries a different button, the grade recorded first stands.
  assert.equal(gradeReview(first.entry, "again", "shown-1", now).result, "good");
  const next = gradeReview(first.entry, "good", "shown-2", now);
  assert.equal(next.applied, true); assert.equal(next.entry.box, 2);
  // Requests without a key (pages loaded before keys existed) still grade.
  assert.equal(gradeReview(next.entry, "again", undefined, now).entry.box, 0);
});

test("评分重试：两个标签页交错（A、B、再重放 A），旧呈现键也只算一次", () => {
  const now = new Date("2026-11-10T00:00:00Z");
  const a = gradeReview(undefined, "again", "A", now);
  const b = gradeReview(a.entry, "good", "B", now);
  assert.equal(b.entry.box, 1);
  const replayA = gradeReview(b.entry, "good", "A", now);
  assert.equal(replayA.applied, false);
  assert.equal(replayA.result, "again", "the grade recorded for A the first time");
  assert.deepEqual(replayA.entry, b.entry);
  // Entries written with the single-key form still recognise their key.
  assert.equal(gradeReview({ box: 2, due: now.toISOString(), key: "old", result: "good" }, "good", "old", now).applied, false);
  // The remembered keys are bounded: only the most recent ones are kept.
  let entry = b.entry;
  for (let i = 0; i < GRADED_KEYS + 5; i++) entry = gradeReview(entry, "good", `k${i}`, now).entry;
  assert.equal(entry.graded?.length, GRADED_KEYS);
  assert.equal(entry.graded?.at(-1)?.[0], `k${GRADED_KEYS + 4}`);
  assert.equal(gradeReview(entry, "good", `k${GRADED_KEYS + 4}`, now).applied, false);
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
