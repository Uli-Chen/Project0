import assert from "node:assert/strict";
import { test } from "node:test";
import { jsx } from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { ReviewDeck, type DeckCard } from "../../components/review/review-deck";
import type { ReviewItem } from "../../lib/learning/review-items";

const unexpected = () => assert.fail("SSR must not navigate");
const router = { back: unexpected, forward: unexpected, refresh: unexpected, push: unexpected, replace: unexpected, prefetch: unexpected };
const render = (cards: DeckCard[]) => renderToStaticMarkup(jsx(AppRouterContext.Provider, { value: router, children: jsx(ReviewDeck, { cards }) }));
const card = (item: ReviewItem, spot = false): DeckCard => ({ item, spot, source: "11月10日 的作文" });

const fix: ReviewItem = { id: "fix:s:1", kind: "fix", prompt: "He go to school every day.", answer: "He goes to school every day.", revised: true, issueTitle: "主谓一致", hint: "先找主语", sessionId: "s", rank: 1, date: "2026-11-10", topic: "education" };
const phrase: ReviewItem = { id: "phrase:s:p", kind: "phrase", prompt: "没人管之后学习变差", answer: "Without supervision, their studies get worse.", note: "直接对应", sessionId: "s", date: "2026-11-09", topic: null };

test("今天的复习是一页列表：每条都只露题面，答案和输入框在展开之前都不出现", () => {
  const html = render([card(fix), card(phrase)]);
  assert.ok(html.includes("He go to school every day.")); assert.ok(html.includes("没人管之后学习变差"));
  assert.ok(html.includes("改句")); assert.ok(html.includes("表达"));
  assert.ok(!html.includes("He goes to school every day.")); assert.ok(!html.includes("Without supervision"));
  assert.ok(!html.includes("<textarea")); assert.ok(!html.includes("先找主语"));
  assert.match(html, /今天 <b[^>]*>2<\/b> 条/); assert.equal((html.match(/aria-expanded="false"/g) ?? []).length, 2);
  assert.match(html, /role="group" aria-label="类别"/); assert.ok(html.includes("全部 2")); assert.ok(html.includes("改句 1")); assert.ok(html.includes("表达 1")); assert.ok(!html.includes("找错 "), "kinds with nothing today are left out");
});

test("过了提示阶段的错句标为找错：不显示问题名和方向", () => {
  const html = render([card(fix, true)]);
  assert.ok(html.includes("找错")); assert.ok(html.includes("He go to school every day."));
  assert.ok(!html.includes("主谓一致")); assert.ok(!html.includes("先找主语"));
});

test("没有到期内容时说明复习内容从哪里来，不显示卡片和评分按钮", () => {
  const html = render([]);
  assert.ok(html.includes("今天没有要复习的")); assert.ok(!html.includes("<textarea")); assert.ok(!html.includes("记住了")); assert.ok(html.includes("今天没有要复习的"));
});
