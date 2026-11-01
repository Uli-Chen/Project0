import assert from "node:assert/strict";
import { test } from "node:test";
import { jsx } from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { FeedbackTab } from "../../components/essay/feedback-tab";
import { EssayUiProvider } from "../../components/essay/essay-ui";
import { SessionProvider } from "../../lib/prototype/session-store";
import { createSession } from "../../lib/pipeline/initial";
import type { Evaluation } from "../../lib/prototype/types";

const evaluation: Evaluation = { scores: { overall: 6, dims: { TR: 6, CC: 6, LR: 6, GRA: 6 }, rationale: { TR: "r", CC: "r", LR: "r", GRA: "r" } }, issues: [{ rank: 1, code: "example", title: "展开例子", why: "需要具体后果", sentenceIds: [1], hintL1: "为什么？", recurring: false }], review: { outlineCoverage: [], breakthrough: null, focusResult: null, selfReportContrast: null, aiRatio: 0 } };
for (const status of ["failed", "pending", "ok", "none"] as const) {
  test(`Required feedback saved; optional review ${status}: score/issues remain visible and failure alone offers 重试`, () => {
    const state = createSession({ kind: "free", mode: "practice" });
    state.stage = "feedback"; state.reviewStatus = status; state.evaluation = evaluation;
    const html = renderToStaticMarkup(jsx(SessionProvider, { initialState: state, children:
      jsx(EssayUiProvider, { children: jsx(FeedbackTab, {}) }) }));
    assert.ok(html.includes("展开例子")); assert.ok(html.includes("练习成绩"));
    assert.equal(html.includes("提纲回顾失败"), status === "failed");
    assert.equal(html.includes(">重试</button>"), status === "failed");
    assert.equal(html.includes("提纲回顾处理中"), status === "pending");
    assert.ok(!html.includes("重试评估"));
  });
}
