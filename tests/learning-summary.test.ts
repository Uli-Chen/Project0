import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PROFILE } from "../lib/auth/types";
import { buildMemory, learningSummary } from "../lib/learning/summary";
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
