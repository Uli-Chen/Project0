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

const fix: ReviewItem = { id: "fix:s:1", kind: "fix", prompt: "He go to school every day.", answer: "He goes to school every day.", revised: true, issueTitle: "主谓一致", hint: "先找主语", sessionId: "s", rank: 1, date: "2026-11-10" };
const phrase: ReviewItem = { id: "phrase:s:p", kind: "phrase", prompt: "没人管之后学习变差", answer: "Without supervision, their studies get worse.", note: "直接对应", sessionId: "s", date: "2026-11-09" };

test("复习卡片先只给题面：自己的答案在对照之前不出现，进度按本轮张数计", () => {
  const html = render([card(fix), card(phrase)]);
  assert.ok(html.includes("改这一句")); assert.ok(html.includes("主谓一致")); assert.ok(html.includes("He go to school every day.")); assert.ok(html.includes("先找主语"));
  assert.ok(!html.includes("He goes to school every day.")); assert.ok(!html.includes("Without supervision"));
  assert.ok(html.includes("0 / 2")); assert.ok(html.includes("看答案")); assert.ok(html.includes('href="/essays/s"'));
});

test("过了提示阶段的错句只问有没有问题：不显示问题名和方向", () => {
  const html = render([card(fix, true)]);
  assert.ok(html.includes("这句有没有问题？")); assert.ok(html.includes("有问题")); assert.ok(html.includes("没问题"));
  assert.ok(!html.includes("主谓一致")); assert.ok(!html.includes("先找主语")); assert.ok(!html.includes("<textarea"));
});

test("没有到期内容时说明复习内容从哪里来，不显示卡片和评分按钮", () => {
  const html = render([]);
  assert.ok(html.includes("今天没有要复习的")); assert.ok(!html.includes("<textarea")); assert.ok(!html.includes("记住了"));
});
