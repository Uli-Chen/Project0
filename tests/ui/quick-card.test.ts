import assert from "node:assert/strict";
import { test } from "node:test";
import { jsx } from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { TooltipProvider } from "../../components/ui/tooltip";
import { SessionView } from "../../components/essay/session-view";
import { ReadonlySession } from "../../components/essay/readonly-session";
import { createSession } from "../../lib/pipeline/initial";
import type { CardSnapshot } from "../../lib/quick/schemas";

const snapshot: CardSnapshot = { cardId: "card", contentVersion: 2, state: "draft", lastCheckedVersion: null, snapshotAt: "2026-11-02T00:00:00.000Z",
  content: { layout: "two_questions", parts: [
    { key: "causes.answer", text: "冻结的学生想法 <script>bad()</script>", provenance: { kind: "direct", userId: "u", editId: "edit", editedAt: "2026-11-01", contentVersion: 1 }, afterFollowUp: 0 },
    { key: "effects.answer", text: "选中的用户原话", provenance: { kind: "excerpt", userId: "u", messageId: "message", start: 0, end: 8 }, afterFollowUp: 1 },
  ] } };
const unexpected = () => assert.fail("SSR must not navigate");
const router = { back: unexpected, forward: unexpected, refresh: unexpected, push: unexpected, replace: unexpected, prefetch: unexpected };
function render(session: ReturnType<typeof createSession>) {
  return renderToStaticMarkup(jsx(AppRouterContext.Provider, { value: router, children: jsx(TooltipProvider, { children: jsx(SessionView, { session }) }) }));
}
for (const stage of ["prewriting", "writing"] as const) test(`精练 ${stage} 左栏只读显示冻结卡片；无快照时原界面不变`, () => {
  const session = createSession({ kind: "free", mode: "practice" }); session.stage = stage;
  const old = render(session); assert.ok(!old.includes("主题卡片快照"));
  session.cardSnapshot = structuredClone(snapshot);
  const html = render(session), aside = html.match(/<aside aria-label="提纲"[\s\S]*?<\/aside>/)?.[0];
  assert.ok(aside); assert.ok(aside.includes("主题卡片快照")); assert.ok(aside.includes("冻结的学生想法")); assert.ok(aside.includes("选中的用户原话"));
  const card = aside.match(/<section aria-label="主题卡片快照"[\s\S]*?<\/section>/)![0];
  assert.ok(!/<button|<textarea|<input|contenteditable|<script/.test(card));
  assert.ok(card.includes("&lt;script&gt;")); assert.ok(card.includes("摘自你的回答"));
  session.cardSnapshot = null; assert.equal(render(session), old);
});

test("速刷页面始终只读显示卡片，包含直接输入和摘取文字且不挂载精练控制器", () => {
  const session = createSession({ kind: "free", mode: "practice" }); session.activity = "quick"; session.stage = "quick";
  for (const questionBankEnabled of [false, true]) {
    const view = SessionView({ session, questionBankEnabled, cardContent: snapshot.content });
    assert.equal(view.type, ReadonlySession);
    const html = renderToStaticMarkup(view);
    assert.ok(html.includes("冻结的学生想法")); assert.ok(html.includes("选中的用户原话"));
    assert.ok(!/<button|<textarea|<input|contenteditable|<script/.test(html));
  }
});
