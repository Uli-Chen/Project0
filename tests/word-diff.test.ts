import assert from "node:assert/strict";
import { test } from "node:test";
import { wordDiff } from "../lib/learning/word-diff";

const marked = (parts: { text: string; changed: boolean }[]) => parts.filter((p) => p.changed).map((p) => p.text);
const rebuilt = (parts: { text: string }[]) => parts.map((p) => p.text).join("");

test("a one-word fix marks only that word on each side and rebuilds both sentences exactly", () => {
  const before = "Online fraud and hacking is becoming more common every year.";
  const after = "Online fraud and hacking are becoming more common every year.";
  const { removed, added } = wordDiff(before, after);
  assert.deepEqual(marked(removed), ["is"]);
  assert.deepEqual(marked(added), ["are"]);
  assert.equal(rebuilt(removed), before);
  assert.equal(rebuilt(added), after);
});

test("a rewritten phrase reads as one highlight, unchanged words stay plain", () => {
  const { removed, added } = wordDiff("The internet is very important for criminals.", "The internet lets criminals reach thousands of victims at once.");
  assert.deepEqual(marked(removed), ["is very important for criminals"]);
  assert.equal(added[0].text, "The internet ");
  assert.equal(added[0].changed, false);
  assert.ok(marked(added).join(" ").includes("lets criminals reach thousands of victims at once"));
});

test("identical sentences have no changes", () => {
  const { removed, added } = wordDiff("He goes to school.", "He goes to school.");
  assert.deepEqual(marked(removed), []);
  assert.deepEqual(marked(added), []);
});
