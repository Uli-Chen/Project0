import assert from "node:assert/strict";
import { test } from "node:test";
import { coachDraftKey, quickDraftKey, restorableDraft } from "../lib/drafts/local-draft";

test("a stored draft comes back unless the server already has that text", () => {
  assert.equal(restorableDraft("没发出去的话", []), "没发出去的话");
  assert.equal(restorableDraft("已经发出去了", ["先前的话", " 已经发出去了 "]), "");
  assert.equal(restorableDraft("   ", []), "");
  assert.equal(restorableDraft("", ["x"]), "");
});
test("keys are per practice and per box", () => {
  assert.notEqual(coachDraftKey("a"), coachDraftKey("b"));
  assert.notEqual(quickDraftKey("a", "answer"), quickDraftKey("a", "ask"));
});
