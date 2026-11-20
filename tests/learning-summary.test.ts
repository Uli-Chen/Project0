import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PROFILE } from "../lib/auth/types";
import { buildMemory, examDateFromWeeks, examDateToSave, learningSummary, weeksLeft } from "../lib/learning/summary";
import { createSession } from "../lib/pipeline/initial";
import { fixedIssues } from "../lib/learning/fixes";
import { practiceDays } from "../lib/learning/practice-days";
import type { Evaluation, Issue } from "../lib/prototype/types";

const issue: Issue = { rank: 1, code: "TR-example", title: "展开例子", why: "例子缺少结果。", sentenceIds: [1], hintL1: "这个例子说明了什么？", recurring: false };
function evaluated(createdAt: string, issues = [issue]) {
  const state = createSession({ kind: "free", mode: "practice" });
  state.createdAt = createdAt;
  state.stage = "finished";
  state.evaluation = { scores: { overall: 6, dims: { TR: 6, CC: 6, LR: 6, GRA: 6 }, rationale: { TR: "", CC: "", LR: "", GRA: "" } }, issues, review: { outlineCoverage: [], breakthrough: null, focusResult: null, selfReportContrast: null, aiRatio: 0 } } satisfies Evaluation;
  return state;
}

test("revisiting an older essay does not rewrite original-score chronology", () => {
  const old = evaluated("2025-01-01T00:00:00Z");
  old.updatedAt = "2026-01-01T00:00:00Z";
  const recent = evaluated("2025-02-01T00:00:00Z");
  recent.updatedAt = "2025-02-01T00:00:00Z";
  const summary = learningSummary([old, recent], DEFAULT_PROFILE);
  assert.equal(summary.latest?.id, recent.id);
  assert.deepEqual(summary.evaluated.map((session) => session.id), [recent.id, old.id]);
});

test("memory counts essays once per issue and exclusions remove recommendation input", () => {
  const first = evaluated("2025-01-01T00:00:00Z", [issue, { ...issue, rank: 2 }]);
  const second = evaluated("2025-02-01T00:00:00Z");
  const profile = { ...DEFAULT_PROFILE, excludedMemoryIds: ["issue:TR-example"] };
  const memory = buildMemory([first, second], profile);
  assert.equal(memory.length, 1);
  assert.equal(memory[0].seen, 2);
  assert.equal(memory[0].checked, 2);
  assert.equal(memory[0].deleted, true);
  assert.equal(learningSummary([first, second], profile).focus, undefined);
});

test("empty profile has no invented score goal or progress; expired dates reach zero", () => {
  const empty = learningSummary([], DEFAULT_PROFILE);
  assert.equal(empty.target, null);
  assert.equal(empty.totalMinutes, 0);
  assert.equal(empty.evaluated.length, 0);
  assert.equal(empty.weekCompleted, 0);
  const expired = learningSummary([], { ...DEFAULT_PROFILE, timeBy: "date", examDate: "2000-01-01" });
  assert.equal(expired.weeks, 0);
  assert.equal(expired.examPassed, true);
});

test("备考周数保存为结束日期，此后每周递减；只存了周数的旧档案照旧显示", () => {
  const setOn = new Date("2026-11-13T04:00:00Z"); // 台北 11 月 13 日中午
  const examDate = examDateFromWeeks("8", setOn);
  assert.equal(examDate, "2027-01-07");
  const profile = { ...DEFAULT_PROFILE, timeBy: "weeks" as const, weeks: "8", examDate };
  assert.equal(weeksLeft(profile, setOn), 8, "the day it is set it reads the weeks the student typed");
  assert.equal(weeksLeft(profile, new Date("2026-11-19T15:00:00Z")), 8);
  assert.equal(weeksLeft(profile, new Date("2026-11-20T04:00:00Z")), 7, "one week later, one week fewer");
  assert.equal(weeksLeft(profile, new Date("2027-01-07T15:00:00Z")), 1);
  assert.equal(weeksLeft(profile, new Date("2027-01-08T04:00:00Z")), 0);
  assert.equal(learningSummary([], { ...profile, examDate: "2000-01-01" }).examPassed, true);
  assert.equal(examDateFromWeeks("", setOn), "");
  const legacy = { ...DEFAULT_PROFILE, timeBy: "weeks" as const, weeks: "6", examDate: "" };
  assert.equal(weeksLeft(legacy, new Date("2030-01-01T00:00:00Z")), 6, "old weeks-only profiles keep working");
  assert.equal(learningSummary([], legacy).examPassed, false);
  assert.equal(weeksLeft({ ...DEFAULT_PROFILE, timeBy: "date", examDate: "2026-11-27" }, setOn), 3);
});

test("保存资料时没改备考周数，结束日期不变；改了才重算；只有周数的旧档案显示为计划长度", () => {
  const today = new Date("2026-11-13T04:00:00Z");
  const plan = { timeBy: "weeks" as const, weeks: "3", examDate: "2026-12-01" };
  assert.equal(weeksLeft(plan, today), 3);
  // Untouched field: the end date stays 12 月 1 日 instead of moving to 12 月 3 日.
  assert.equal(examDateToSave(plan, { timeBy: "weeks", examDate: "", weeks: "3", weeksChanged: false }, today), "2026-12-01");
  assert.equal(examDateToSave(plan, { timeBy: "weeks", examDate: "", weeks: "5", weeksChanged: true }, today), examDateFromWeeks("5", today));
  assert.equal(examDateToSave(plan, { timeBy: "date", examDate: "2027-02-01", weeks: "3", weeksChanged: false }, today), "2027-02-01");
  // A plan that has already ended keeps its date too: only changing the week count renews it.
  assert.equal(examDateToSave({ ...plan, examDate: "2026-11-01" }, { timeBy: "weeks", examDate: "", weeks: "1", weeksChanged: false }, today), "2026-11-01");
  assert.equal(examDateToSave({ ...plan, examDate: "2026-11-01" }, { timeBy: "weeks", examDate: "", weeks: "2", weeksChanged: true }, today), examDateFromWeeks("2", today));
  // Switching from an exam date to weeks starts the typed count.
  assert.equal(examDateToSave({ timeBy: "date", weeks: "", examDate: "2027-02-01" }, { timeBy: "weeks", examDate: "", weeks: "4", weeksChanged: false }, today), examDateFromWeeks("4", today));
  // A weeks-only profile stays a plan length until the learner changes the count.
  const legacy = { timeBy: "weeks" as const, weeks: "8", examDate: "" };
  assert.equal(examDateToSave(legacy, { timeBy: "weeks", examDate: "", weeks: "8", weeksChanged: false }, today), "");
  assert.equal(examDateToSave(legacy, { timeBy: "weeks", examDate: "", weeks: "8", weeksChanged: true }, today), examDateFromWeeks("8", today));
  const legacySummary = learningSummary([], { ...DEFAULT_PROFILE, ...legacy });
  assert.equal(legacySummary.countsDown, false);
  assert.equal(legacySummary.timeLeft, "计划备考 8 周");
  assert.equal(learningSummary([], { ...DEFAULT_PROFILE, timeBy: "date", examDate: "2000-01-01" }).timeLeft, "考试日期已过");
  assert.equal(learningSummary([], { ...DEFAULT_PROFILE, ...plan, examDate: examDateFromWeeks("3") }).timeLeft, "还有 3 周");
});

test("fixed issues come from revision comparisons judged resolved, newest first", () => {
  const older = evaluated("2025-01-01T00:00:00Z", [issue, { ...issue, rank: 2, title: "论证没说清原因" }]);
  older.completedAt = "2025-01-02T00:00:00Z";
  older.comparison = { issues: [{ rank: 1, status: "resolved", reason: "", revisionSentenceIds: [1] }, { rank: 2, status: "partly", reason: "", revisionSentenceIds: [] }] } as unknown as typeof older.comparison;
  const newer = evaluated("2025-02-01T00:00:00Z", [{ ...issue, title: "论证没说清原因" }]);
  newer.completedAt = "2025-02-02T00:00:00Z";
  newer.comparison = { issues: [{ rank: 1, status: "resolved", reason: "", revisionSentenceIds: [2] }] } as unknown as typeof newer.comparison;
  const noRevision = evaluated("2025-03-01T00:00:00Z");
  assert.deepEqual(fixedIssues([older, newer, noRevision]).map((item) => [item.sessionId, item.title]), [[newer.id, "论证没说清原因"], [older.id, "展开例子"]]);
});

test("practice days count per Taipei day, Monday first, with no count after today", () => {
  const now = new Date("2026-11-20T04:00:00Z"); // Friday in Taipei
  const { weeks, activeDays } = practiceDays(["2026-11-19T17:30:00Z", "2026-11-20T01:00:00Z", "2026-11-17T03:00:00Z", null, "2025-01-01T00:00:00Z"], 2, now);
  assert.equal(weeks.length, 2);
  assert.equal(weeks[1][0].date, "2026-11-16");
  assert.deepEqual(weeks[1].map((cell) => cell.count), [0, 1, 0, 0, 2, null, null]);
  assert.equal(weeks[1][4].today, true);
  assert.equal(activeDays, 2);
});
