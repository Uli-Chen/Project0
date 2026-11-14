import assert from "node:assert/strict";
import { test } from "node:test";
import { answerToRestore, coachDraftKey, decodeAnswer, differingFields, editableFields, encodeAnswer, essayLeftoverKey, joinDraft, leftoversToOffer, quickDraftKey } from "../lib/drafts/local-draft";

test("a stored answer is dropped only when the server has that reply to that question", () => {
  const stored = decodeAnswer(encodeAnswer("要坐很久的车", "q1"));
  assert.deepEqual(stored, { text: "要坐很久的车", questionId: "q1" });
  assert.equal(answerToRestore(stored, []), "要坐很久的车");
  assert.equal(answerToRestore(stored, [{ role: "user", replyToMessageId: "q1", content: " 要坐很久的车 " }]), "");
  // The same words said earlier, to another question, do not count as delivered.
  assert.equal(answerToRestore(stored, [{ role: "user", replyToMessageId: "q0", content: "要坐很久的车" }]), "要坐很久的车");
  // Answered differently elsewhere: the typed text is still the student's and comes back.
  assert.equal(answerToRestore(stored, [{ role: "user", replyToMessageId: "q1", content: "别的回答" }]), "要坐很久的车");
  assert.equal(encodeAnswer("  ", "q1"), "");
  assert.equal(decodeAnswer(""), null);
  assert.deepEqual(decodeAnswer("旧格式的纯文本"), { text: "旧格式的纯文本", questionId: null });
});
test("keys are per practice and per box", () => {
  assert.notEqual(coachDraftKey("a"), coachDraftKey("b"));
  assert.notEqual(quickDraftKey("a", "answer"), quickDraftKey("a", "ask"));
  assert.notEqual(essayLeftoverKey("a"), coachDraftKey("a"));
});

test("returned text goes in front of the box without duplicating", () => {
  assert.equal(joinDraft("", "A"), "A");
  assert.equal(joinDraft("B", "A"), "A\nB");
  assert.equal(joinDraft("A\nB", "A"), "A\nB");
  assert.equal(joinDraft("B", ""), "B");
});

test("a leftover the server already holds is not offered", () => {
  const server = { stage: "writing", drafts: { original: "A", revision: "" }, outline: { stance: null } };
  const same = { owner: "x", at: 1, drafts: { original: "A", revision: "" }, outline: { stance: null } };
  const differs = { ...same, owner: "y", drafts: { original: "A plus more", revision: "" } };
  assert.deepEqual(leftoversToOffer([same, differs], server).map(r => r.owner), ["y"]);
});

test("restore only covers what the current stage saves", () => {
  const server = { stage: "feedback", drafts: { original: "A", revision: "" }, outline: {} };
  const record = { owner: "x", at: 1, drafts: { original: "A more", revision: "" }, outline: {} };
  assert.deepEqual(differingFields(record, server), ["original"]);
  assert.deepEqual(editableFields("feedback"), []);
  assert.deepEqual(editableFields("writing"), ["original", "outline"]);
  assert.deepEqual(editableFields("revising"), ["revision", "outline"]);
});
