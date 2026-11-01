import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { QuickScreen } from "../../components/quick/quick-screen";
import { createSession } from "../../lib/pipeline/initial";
import type { QuestionRequirements } from "../../lib/question-bank/types";

const requirements: QuestionRequirements = { id: "test", version: 1, layout: "two_questions", requiresOverallJudgement: false, subquestions: [{ key: "cause", en: "Why?", zh: "原因是什么？" }, { key: "effect", en: "What effect?", zh: "影响是什么？" }] };
const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch: async () => {} };
function render(state: string, status: string, lifecycle: "open" | "closed" = "open") {
  const session = createSession({ kind: "free", mode: "practice" }); session.activity = "quick"; session.stage = "quick"; session.lifecycle = lifecycle;
  return renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, createElement(QuickScreen, { requirements, initial: {
    session, card: { contentVersion: 2, content: { layout: "two_questions", parts: [] }, state },
    operations: [{ id: "op", kind: "check", status }], budget: { remaining: { followups: 1, checks: 0, retries: 1 }, nextSupplementalAt: "2026-11-02T00:00:00Z" },
    checkResults: [{ cardVersion: 1, results: [{ id: "old", status: "met", note: "obsolete result" }] }, { cardVersion: 2, results: [{ id: "cause", status: "gap", note: "<script>alert(1)</script>" }] }],
  } })));
}
test("Quick editor exposes each requirement, current check only, honest quota and safe model text", () => {
  const html = render("needs_development", "invalid_output");
  for (const text of ["原因是什么", "影响是什么", "cause.answer", "effect.why", "重试这次操作", "额度用完仍可编辑", "补充检查最早可申请", "&lt;script&gt;"]) assert.ok(html.includes(text), text);
  assert.ok(!html.includes("obsolete result")); assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("提交评估"));
});
test("passed cards expose Deep continuation and interrupted operations remain explicit", () => {
  assert.match(render("passed", "ok"), /用这张卡写成作文/);
  assert.match(render("unchecked", "indeterminate"), /上次检查没有完成/);
  assert.match(render("draft", "stale"), /检查期间卡片有修改/);
  assert.match(render("draft", "ok", "closed"), /恢复练习/);
});
