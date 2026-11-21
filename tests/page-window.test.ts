import assert from "node:assert/strict";
import { test } from "node:test";
import { pageWindow } from "../lib/rules/page-window";

test("page numbers keep the first, the last and the current page with its neighbours, with gaps between", () => {
  assert.deepEqual(pageWindow(1, 1), [1]);
  assert.deepEqual(pageWindow(2, 3), [1, 2, 3]);
  assert.deepEqual(pageWindow(1, 18), [1, 2, null, 18]);
  assert.deepEqual(pageWindow(9, 18), [1, null, 8, 9, 10, null, 18]);
  assert.deepEqual(pageWindow(3, 18), [1, 2, 3, 4, null, 18]);
  assert.deepEqual(pageWindow(18, 18), [1, null, 17, 18]);
});
