import assert from "node:assert/strict";
import { test } from "node:test";
import { recoverComposerDraft } from "../../lib/prototype/session-store";

test("invalidated hints preserve unsent composer text instead of restoring their empty input", () => {
  assert.equal(recoverComposerDraft("还没发送的想法", { action: "prewrite", text: "", intent: "more" }), "还没发送的想法");
  assert.equal(recoverComposerDraft("正在写的新句子", { action: "issue", rank: 1, intent: "more" }), "正在写的新句子");
  assert.equal(recoverComposerDraft("", { action: "prewrite", text: "", intent: "more" }), "");
});

test("invalidated typed requests restore an empty composer but never overwrite newer input", () => {
  const original = { action: "prewrite" as const, text: "我的原始问题" };
  assert.equal(recoverComposerDraft("", original), "我的原始问题");
  assert.equal(recoverComposerDraft("用户等待时新写的问题", original), "用户等待时新写的问题");
  assert.equal(recoverComposerDraft(" ", original), " ");
  assert.equal(recoverComposerDraft("", { action: "issue", rank: 2, intent: "attempt", text: "This seems clear." }), "This seems clear.");
  assert.equal(recoverComposerDraft("", { action: "startRevision", openIssue: 2 }), "");
});
