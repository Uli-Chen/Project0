import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession } from "../lib/pipeline/initial";
import { DAILY_LIMIT, dueItems, languageIssue, gradeReview, legacyGrade, matchRevision, nextReview, reviewItems, spotStage, todayItems, type ReviewItem } from "../lib/learning/review-items";
import { draftMarks, remainingByIssue } from "../lib/learning/revision-marks";

function practised() {
  const session = createSession({ kind: "free", mode: "practice" });
  session.submitted.original = "He go to school every day. The rent is expensive.\n\nStudents feels homesick.";
  session.submitted.revision = "He goes to school every day. The rent is expensive.\n\nSome students feel homesick at first.";
  session.evaluation = { scores: { overall: 6, dims: { TR: 6, CC: 6, LR: 6, GRA: 6 }, rationale: { TR: "", CC: "", LR: "", GRA: "" } },
    issues: [{ rank: 1, code: "GRA_SVA", title: "主谓一致", why: "", sentenceIds: [1, 3], hintL1: "先找主语", recurring: false }],
    review: { outlineCoverage: [], breakthrough: null, focusResult: null, selfReportContrast: null, aiRatio: 0 } };
  session.comparison = { issues: [{ rank: 1, status: "resolved", reason: "", revisionSentenceIds: [1, 3] }], idea: { stanceKept: true, keptPoints: [], deepened: [], changed: [] }, aiRatio: 0 };
  session.completedAt = "2026-11-09T00:00:00.000Z";
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
  // Each checked fix also becomes a sound sentence for spot-the-problem reviews.
  assert.deepEqual(items.filter(item => item.kind === "sound").map(item => item.prompt), ["He goes to school every day.", "Some students feel homesick at first."]);
  session.submitted.revision = null;
  assert.equal(reviewItems([session]).find(item => item.kind === "fix")!.answer, null);
});

test("只有核验判为解决的改法才算答案：对比没判解决时，改写稿里的句子也不显示", () => {
  const session = practised();
  session.comparison!.issues[0].status = "partly";
  const fixes = reviewItems([session]).filter(item => item.kind === "fix");
  assert.deepEqual(fixes.map(item => item.answer), [null, null]);
  assert.equal(reviewItems([session]).some(item => item.kind === "sound"), false);
  session.comparison = null;
  assert.deepEqual(reviewItems([session]).filter(item => item.kind === "fix").map(item => item.answer), [null, null]);
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
  assert.equal(dueItems(after, state, new Date("2026-11-10T12:00:00Z")).length, after.length - 1, "progress keyed by id survives the revision");
  // A rewrite that leaves nothing matching still removes no card.
  session.submitted.revision = "Completely different text about technology.";
  assert.deepEqual(reviewItems([session]).filter(item => item.kind === "fix").map(item => [item.id, item.answer]), before.map(item => [item.id, null]));
});

test("没改动的句子、完全无关的句子都不算“改法”", () => {
  assert.equal(matchRevision("The rent is expensive.", ["The rent is expensive.", "Other text here."]), null);
  assert.equal(matchRevision("He go to school.", ["Technology changes quickly these days."]), null);
});

test("排期：新内容第二天到期，答对后隔 3 天、7 天，连续三次答对就掌握；没答对回到当天", () => {
  const items = reviewItems([practised()]).filter(item => item.kind !== "sound");
  const sameDay = new Date("2026-11-09T12:00:00Z"), nextDay = new Date("2026-11-10T00:00:01Z");
  assert.equal(dueItems(items, {}, sameDay).length, 0, "nothing is due on the day it was made");
  assert.equal(dueItems(items, {}, nextDay).length, items.length);
  const now = new Date("2026-11-10T00:00:00Z");
  const first = nextReview(undefined, "good", now);
  assert.deepEqual(first, { box: 1, due: "2026-11-13T00:00:00.000Z" });
  const second = nextReview(first, "good", now);
  assert.deepEqual(second, { box: 2, due: "2026-11-17T00:00:00.000Z" });
  const third = nextReview(second, "good", now);
  assert.equal(third.box, 3);
  assert.equal(dueItems(items, { [items[0].id]: third }, new Date("2027-01-01T00:00:00Z")).some(item => item.id === items[0].id), false, "a mastered item never comes back");
  assert.deepEqual(nextReview(second, "again", now), { box: 0, due: now.toISOString() });
});

test("提示渐退：错句前两次带问题和方向，之后只问有没有问题；改对的句子在那之后才混进来", () => {
  const items = reviewItems([practised()]), now = new Date("2026-11-20T00:00:00Z");
  const fix = items.find(item => item.kind === "fix")!, sound = items.find(item => item.kind === "sound" && item.fixId === fix.id)!;
  assert.equal(spotStage(fix, {}), false);
  assert.equal(spotStage(fix, { [fix.id]: { box: 1, due: now.toISOString() } }), false);
  assert.equal(spotStage(fix, { [fix.id]: { box: 2, due: now.toISOString() } }), true);
  assert.equal(dueItems(items, {}, now).some(item => item.id === sound.id), false, "the sound sentence waits");
  assert.equal(dueItems(items, { [fix.id]: { box: 2, due: now.toISOString() } }, now).some(item => item.id === sound.id), true);
});

test("今天的复习：最早到期的先出，每天最多 8 条", () => {
  const sessions = Array.from({ length: 6 }, (_, i) => { const s = practised(); s.completedAt = `2026-11-0${i + 1}T00:00:00.000Z`; return s; });
  const items: ReviewItem[] = reviewItems(sessions), now = new Date("2026-11-20T00:00:00Z");
  const today = todayItems(items, {}, now);
  assert.equal(today.length, DAILY_LIMIT);
  assert.equal(today[0].sessionId, sessions[0].id, "the oldest due comes first");
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

test("评分只决定下一次排期；之前版本记在资料里的回执仍能认出", () => {
  const now = new Date("2026-11-10T00:00:00Z");
  const first = gradeReview(undefined, "good", now);
  assert.equal(first.box, 1);
  assert.equal(gradeReview(first, "good", now).box, 2);
  assert.equal(gradeReview(first, "again", now).box, 0);
  assert.equal("graded" in first, false, "receipts no longer live in the profile");
  assert.equal(legacyGrade({ box: 2, due: now.toISOString(), key: "old", result: "good" }, "old"), "good");
  assert.equal(legacyGrade({ box: 2, due: now.toISOString(), graded: [["a", "again"], ["b", "good"]] }, "a"), "again");
  assert.equal(legacyGrade({ box: 2, due: now.toISOString() }, "a"), null);
  assert.equal(legacyGrade(undefined, "a"), null);
});

test("复习内容带上作文的话题：题库题用题目的话题，自己的题用创建时选的话题，没选过的为空", () => {
  const own = practised();
  own.prompt = { ...own.prompt, topicTags: [] };
  assert.deepEqual([...new Set(reviewItems([own]).map(item => item.topic))], [null]);
  const chosen = createSession({ kind: "free", mode: "practice", prompt: "Some people think cities should ban private cars entirely.", topic: "environment" });
  assert.deepEqual(chosen.prompt.topicTags, ["environment"]);
  assert.deepEqual(createSession({ kind: "free", mode: "practice", prompt: "Some people think cities should ban private cars entirely.", topic: "other" }).prompt.topicTags, []);
  Object.assign(own, { prompt: chosen.prompt });
  assert.deepEqual([...new Set(reviewItems([own]).map(item => item.topic))], ["environment"]);
  own.question = { id: "q", version: 1, exposureKey: "f", primaryTopic: "education", questionType: "agree_disagree" } as unknown as typeof own.question;
  assert.deepEqual([...new Set(reviewItems([own]).map(item => item.topic))], ["education"]);
});

test("只有语言类问题做成改句卡：论证、结构和认不出的问题不进复习", () => {
  for (const code of ["GRA_SVA", "GRA-sva", "GRA", "gra_articles", "LR_COLLOCATION", "LEX_REPETITION", "GRAMMAR", "VOCAB_CHOICE"]) assert.equal(languageIssue(code), true, code);
  for (const code of ["TR-reason", "TR_DEVELOPMENT", "CC_PARAGRAPHING", "DISADV_DEPTH", "EXAMPLE_RELEVANCE", "LRX", "sva", ""]) assert.equal(languageIssue(code), false, code);
  const session = practised();
  session.evaluation!.issues = [
    { rank: 1, code: "TR_DEVELOPMENT", title: "论证展开不足", why: "", sentenceIds: [2], hintL1: "", recurring: false },
    { rank: 2, code: "GRA_SVA", title: "主谓一致", why: "", sentenceIds: [1, 3], hintL1: "先找主语", recurring: false },
  ];
  session.comparison!.issues = [{ rank: 2, status: "resolved", reason: "", revisionSentenceIds: [1, 3] }];
  const fixes = reviewItems([session]).filter(item => item.kind === "fix");
  assert.deepEqual(fixes.map(item => item.kind === "fix" && item.issueTitle), ["主谓一致", "主谓一致"]);
  assert.equal(fixes.some(item => item.prompt === "The rent is expensive."), false);
});
