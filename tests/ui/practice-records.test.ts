import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PracticeRecords, type PracticeRecord } from "../../components/practice/practice-records";

const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch: async () => {} };
const essay: PracticeRecord = { id: "e1", prompt: "Some people think technology makes learning easier.", kind: "作文", status: "revising", completed: true, lifecycle: "open", statusLabel: "已完成 · 改写中", original: 6, revision: 6.5, date: "11月13日" };
const card: PracticeRecord = { id: "c1", prompt: "Should university education be free?", kind: "卡片", status: "drafting", completed: false, lifecycle: "open", statusLabel: "写作中", original: null, revision: null, date: "11月14日" };

test("practice records list cards and essays together with a pressed-button filter", () => {
  const html = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, createElement(PracticeRecords, { rows: [card, essay] })));
  assert.match(html, /aria-label="我的练习"/);
  assert.match(html, /role="group" aria-label="筛选"/);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(html, /全部 2/);
  assert.match(html, /进行中 1/);
  assert.match(html, /已完成 1/);
  assert.match(html, /href="\/essays\/c1"/);
  assert.match(html, /卡片/);
  assert.match(html, /6\.0 → 6\.5/);
  assert.doesNotMatch(html, /role="tab/);
});
