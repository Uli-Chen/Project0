import assert from "node:assert/strict";
import { test } from "node:test";
import { readFeatures } from "../lib/config/features";

test("features default off and only literal true enables a flag", () => {
  const off = { QUESTION_BANK_ENABLED: false, QUICK_ENABLED: false, CHECKPOINTS_ENABLED: false, FOCUS_ENABLED: false, TUTOR_V2_ENABLED: false };
  assert.deepEqual(readFeatures({}), off);
  for (const value of ["false", "1", "TRUE", "", " true "]) assert.deepEqual(readFeatures(Object.fromEntries(Object.keys(off).map(key => [key, value]))), off);
});

test("Quick and checkpoints require the question bank; focus is independent", () => {
  for (const bank of [undefined, "false", "true"]) for (const quick of ["false", "true"]) for (const checkpoints of ["false", "true"]) {
    const flags = readFeatures({ QUESTION_BANK_ENABLED: bank, QUICK_ENABLED: quick, CHECKPOINTS_ENABLED: checkpoints, FOCUS_ENABLED: "true" });
    assert.equal(flags.QUESTION_BANK_ENABLED, bank === "true");
    assert.equal(flags.QUICK_ENABLED, bank === "true" && quick === "true");
    assert.equal(flags.CHECKPOINTS_ENABLED, bank === "true" && checkpoints === "true");
    assert.equal(flags.FOCUS_ENABLED, true);
  }
});

test("feature reader reads the runtime environment", () => {
  const previous = process.env.QUESTION_BANK_ENABLED;
  try {
    process.env.QUESTION_BANK_ENABLED = "true";
    assert.equal(readFeatures().QUESTION_BANK_ENABLED, true);
    process.env.QUESTION_BANK_ENABLED = "false";
    assert.equal(readFeatures().QUESTION_BANK_ENABLED, false);
  } finally { if (previous === undefined) delete process.env.QUESTION_BANK_ENABLED; else process.env.QUESTION_BANK_ENABLED = previous; }
});
