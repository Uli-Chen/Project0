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
function render(state: string, status: string, lifecycle: "open" | "closed" = "open", kind: "check" | "followup" = "check") {
  const session = createSession({ kind: "free", mode: "practice" }); session.activity = "quick"; session.stage = "quick"; session.lifecycle = lifecycle;
  return renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, createElement(QuickScreen, { requirements, initial: {
    session, card: { contentVersion: 2, content: { layout: "two_questions", parts: [] }, state },
    operations: [{ id: "op", kind, status }], budget: { remaining: { followups: 1, checks: 0, retries: 1 }, nextSupplementalAt: "2026-11-02T00:00:00Z" },
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
  assert.match(render("unchecked", "indeterminate"), /上次操作没有完成/);
  assert.match(render("draft", "stale"), /检查期间卡片有修改/);
  assert.match(render("draft", "ok", "closed"), /恢复练习/);
});

test("pending followup is labelled as coaching rather than a paid card check, including restored polling state", () => {
 const followup = render("draft", "running", "open", "followup");
 assert.match(followup, /教练追问中/); assert.match(followup, /教练正在追问/); assert.ok(!followup.includes("检查处理中"));
 assert.match(render("draft", "running"), /检查处理中/);
});
test("supplemental check stays disabled until the client has checked the displayed earliest time", () => {
 const html = render("draft", "ok");
 assert.match(html, /<button[^>]*disabled[^>]*>申请补充检查<\/button>/);
 assert.match(html, /补充检查最早可申请/);
});
