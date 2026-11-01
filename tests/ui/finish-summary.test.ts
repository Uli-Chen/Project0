import assert from "node:assert/strict";
import { test } from "node:test";
import { jsx } from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { FinishSummary } from "../../components/essay/finish-summary";
import { SessionProvider } from "../../lib/prototype/session-store";
import { createSession } from "../../lib/pipeline/initial";
for (const questionBankEnabled of [true, false]) for (const hasQuestion of [true, false]) {
  test(`finish 下一步: bank=${questionBankEnabled}, question=${hasQuestion}, links to topic only when both; old plan never displayed`, () => {
    const state = createSession({ kind: "free", mode: "practice" });
    if (hasQuestion) state.question = { id: "q", version: 1, exposureKey: "f", bankVersion: "v1", primaryTopic: "education", questionType: "agree_disagree", text: "Question" };
    state.finish = { memoryChanges: [{ kind: "new", text: "本篇证据" }], ...{ planChange: "历史计划不得显示" } };
    const html = renderToStaticMarkup(jsx(SessionProvider, { initialState: state, questionBankEnabled, children: jsx(FinishSummary, {}) }));
    assert.ok(html.includes(`href="${questionBankEnabled && hasQuestion ? "/topics/education" : "/"}"`));
    assert.ok(html.includes("下一步")); assert.ok(!html.includes("历史计划不得显示"));
  });
}
