import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { EssayTable, type EssayRow } from "../../components/library/essay-table";

const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch: async () => {} };
const row: EssayRow = { id: "e1", prompt: "Some people think technology makes learning easier.", kind: "练习", status: "evaluated", completed: false, lifecycle: "open", statusLabel: "已评估", original: 6, revision: null, date: "11月13日" };

test("the essay list filter is a group of pressed buttons, not tabs without panels", () => {
  const html = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, createElement(EssayTable, { rows: [row] })));
  assert.match(html, /role="group" aria-label="筛选作文"/);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /role="tab/);
});
