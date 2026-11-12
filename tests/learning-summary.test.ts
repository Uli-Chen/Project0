import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PROFILE } from "../lib/auth/types";
import { buildMemory, examDateFromWeeks, learningSummary, weeksLeft } from "../lib/learning/summary";
import { createSession } from "../lib/pipeline/initial";
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
