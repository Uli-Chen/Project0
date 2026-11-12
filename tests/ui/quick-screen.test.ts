import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { QUICK_STARTERS, QuickScreen } from "../../components/quick/quick-screen";
import { createSession } from "../../lib/pipeline/initial";
import type { QuestionRequirements } from "../../lib/question-bank/types";
import type { CoachMessage } from "../../lib/prototype/types";

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

function renderCoach({ messages = [], operations = [], followups = 2 }: { messages?: CoachMessage[]; operations?: { id: string; kind: string; status: string }[]; followups?: number }) {
  const session = createSession({ kind: "free", mode: "practice" }); session.activity = "quick"; session.stage = "quick"; session.messages = messages;
  return renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, createElement(QuickScreen, { requirements, initial: {
    session, card: { contentVersion: 1, content: { layout: "two_questions", parts: [] }, state: "draft" },
    operations, budget: { remaining: { followups, checks: 2, retries: 1 }, nextSupplementalAt: null },
  } })));
}
const askInput = "问教练，或者先说说你的想法", answerInput = "想到什么写什么，中英文都可以";
const question: CoachMessage = { id: "q1", role: "coach", stage: "quick", action: "quickFollowup", afterFollowUp: 1, content: "你身边有谁离家上学？" };
const asked = (content: string): CoachMessage => ({ id: "a1", role: "user", stage: "quick", action: "quickAsk", userId: "u", afterFollowUp: 0, content });

test("coach panel bottom: a pending question gets the answer box only", () => {
  const html = renderCoach({ messages: [question], operations: [{ id: "op", kind: "followup", status: "ok" }] });
  assert.ok(html.includes(answerInput)); assert.ok(!html.includes(askInput)); assert.ok(!html.includes("可以这样问教练"));
});
test("coach panel bottom: a failed follow-up leaves only its retry row, no input or starters", () => {
  const html = renderCoach({ operations: [{ id: "op", kind: "followup", status: "timeout" }] });
  assert.match(html, /重试这次操作/);
  assert.ok(!html.includes(askInput)); assert.ok(!html.includes(answerInput)); assert.ok(!html.includes("可以这样问教练"));
});
test("coach panel bottom: no follow-ups left shows the used-up line, no input", () => {
  const html = renderCoach({ messages: [asked("我想从独立说起"), question, { id: "r1", role: "user", stage: "quick", action: "quickAnswer", replyToMessageId: "q1", content: "我表哥" }], operations: [{ id: "op", kind: "followup", status: "ok" }], followups: 0 });
  assert.match(html, /这张卡的追问用完了/);
  assert.ok(!html.includes(askInput)); assert.ok(!html.includes(answerInput)); assert.ok(!html.includes("可以这样问教练"));
});
test("coach panel bottom: otherwise starters sit above a free input", () => {
  const html = renderCoach({});
  const starters = html.indexOf(QUICK_STARTERS[0]), input = html.indexOf(askInput);
  assert.ok(starters > 0 && input > starters, "starters above the input");
  assert.ok(html.includes(QUICK_STARTERS[1])); assert.ok(!html.includes(answerInput));
});
test("a self-typed quickAsk bubble can go into the card; a starter click cannot", () => {
  const own = renderCoach({ messages: [asked("我觉得离家上学能锻炼独立")], operations: [{ id: "op", kind: "followup", status: "running" }] });
  assert.match(own, /我觉得离家上学能锻炼独立/); assert.match(own, /放进卡片/); assert.match(own, /data-answer="a1"/);
  const starter = renderCoach({ messages: [asked(QUICK_STARTERS[0])], operations: [{ id: "op", kind: "followup", status: "running" }] });
  assert.ok(starter.includes(QUICK_STARTERS[0])); assert.ok(!starter.includes("放进卡片")); assert.ok(!starter.includes("data-answer"));
});
test("every starter the panel offers is excluded from 放进卡片", () => {
  for (const text of QUICK_STARTERS) {
    const html = renderCoach({ messages: [asked(text)], operations: [{ id: "op", kind: "followup", status: "running" }] });
    assert.ok(html.includes(text)); assert.ok(!html.includes("放进卡片"), text);
  }
});
test("a polite live region exists for new coach questions, and the save state stays visible on narrow screens", () => {
  const html = renderCoach({});
  assert.match(html, /<p aria-live="polite" class="sr-only">/);
  const status = html.match(/<span aria-live="polite" class="([^"]*)"/)?.[1] ?? "";
  assert.ok(status.includes("inline-flex") && !/(^| )hidden( |$)/.test(status), status);
  assert.match(html, /已保存/);
});
