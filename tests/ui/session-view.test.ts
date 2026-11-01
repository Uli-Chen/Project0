import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionView } from "../../components/essay/session-view";
import { ReadonlySession } from "../../components/essay/readonly-session";
import { EssayScreen } from "../../components/essay/essay-screen";
import { SessionProvider } from "../../lib/prototype/session-store";
import { createSession } from "../../lib/pipeline/initial";
import { readSession } from "../../lib/pipeline/read-session";
import { legacySession } from "../helpers/legacy-session";

for (const [name, activity, stage] of [["Quick activity", "quick", "writing"], ["Quick stage", "deep", "quick"], ["unknown activity", "future", "writing"], ["unknown stage", "deep", "future"]]) {
  test(`${name} renders stored content without mounting SessionProvider or essay controls`, () => {
    const session = readSession(JSON.stringify({ ...legacySession(), activity, stage,
      drafts: { original: "原稿文字 <script>alert(1)</script>", revision: "改写文字" }, submitted: { original: "已提交原稿", revision: null },
      messages: [{ id: "m", role: "user", content: "用户原话", quote: "被引用的原话" }],
      pendingAction: { requestId: "pending", input: { action: "evaluate", kind: "original" }, startedAt: "2026-01-01" },
    }));
    const view = SessionView({ session });
    assert.equal(view.type, ReadonlySession);
    const html = renderToStaticMarkup(view);
    for (const content of [session.prompt.text, "原稿文字", "改写文字", "已提交原稿", "用户原话", "被引用的原话", "I agree", "只读"]) assert.ok(html.includes(content), content);
    assert.equal(/<button|<textarea|<input|<form|contenteditable|<script|提交评估|开始写作|开始改写|重试评估/i.test(html), false);
  });
}

test("legacy and Deep sessions retain the original provider and EssayScreen", () => {
  for (const session of [readSession(JSON.stringify(legacySession())), createSession({ kind: "free", mode: "practice" })]) {
    const view = SessionView({ session });
    assert.equal(view.type, SessionProvider);
    assert.equal(view.props.initialState, session);
    assert.equal(view.props.children.type, EssayScreen);
  }
});

test("read-only view prefers the frozen question and tolerates absent essay-only fields", () => {
  const session = readSession(JSON.stringify({ schemaVersion: 2, activity: "quick", stage: "quick",
    question: { text: "冻结的题目" }, prompt: { text: "旧题干" },
  }));
  const html = renderToStaticMarkup(SessionView({ session }));
  assert.ok(html.includes("冻结的题目"));
  assert.equal(html.includes("旧题干"), false);
  assert.equal(/<button|<textarea|<input/.test(html), false);
});
