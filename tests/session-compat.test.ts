import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession } from "../lib/pipeline/initial";
import { isSupportedSession, readSession } from "../lib/pipeline/read-session";
import { legacySession, newSessionFields } from "./helpers/legacy-session";

test("legacy reader adds only compatibility defaults and preserves all unknown fields without inventing times", () => {
  const legacy = legacySession();
  const json = JSON.stringify(legacy);
  const read = readSession(json);
  assert.equal(read.schemaVersion, 1);
  assert.equal(read.activity, "deep");
  assert.equal(read.lifecycle, "open");
  assert.equal(read.reviewStatus, "none");
  for (const field of newSessionFields.filter(key => !["schemaVersion", "activity", "lifecycle", "reviewStatus"].includes(key))) assert.equal(read[field], null, field);
  for (const [key, value] of Object.entries(legacy)) assert.deepEqual((read as unknown as Record<string, unknown>)[key], value, key);
  assert.equal(JSON.stringify(legacy), json);
  assert.equal(readSession(JSON.stringify({ ...legacy, stage: "finished" })).lifecycle, "closed");
  assert.equal(readSession(JSON.stringify({ ...legacy, schemaVersion: 1 })).schemaVersion, 1);
});

test("v2 reading is idempotent and preserves recorded snapshots, lifecycle and timestamps", () => {
  const state = { ...createSession({ kind: "free", mode: "mock" }),
    activity: "quick", stage: "quick", lifecycle: "set_aside",
    question: { id: "q", version: 1, exposureKey: "family", bankVersion: "bank", primaryTopic: "work", questionType: "two_part", text: "Frozen question", future: [1] },
    cardSnapshot: { futureContent: { parts: ["原话"] } },
    lastStudentActionAt: "2026-01-01T00:00:00Z", continuedFromQuickId: "quick-id", rewriteOfDeepId: "deep-id",
    originalSubmittedAt: "2026-01-02T00:00:00Z", completedAt: "2026-01-03T00:00:00Z", feedbackUpdatedAt: "2026-01-04T00:00:00Z", checkpointId: "checkpoint",
  };
  const first = readSession(JSON.stringify(state));
  assert.deepEqual(first, state);
  assert.deepEqual(readSession(JSON.stringify(first)), first);
  const future = { ...state, schemaVersion: 3, activity: "future", stage: "future" };
  assert.deepEqual(readSession(JSON.stringify(future)), future);
});

test("new sessions start at v2 Deep/open with null evidence and provenance", () => {
  const state = createSession({ kind: "free", mode: "practice" });
  assert.equal(state.schemaVersion, 2);
  assert.equal(state.activity, "deep");
  assert.equal(state.lifecycle, "open");
  assert.equal(state.reviewStatus, "none");
  for (const field of newSessionFields.filter(key => !["schemaVersion", "activity", "lifecycle", "reviewStatus"].includes(key))) assert.equal(state[field], null, field);
});

test("support requires Deep and an existing essay stage, never Quick or unknown values", () => {
  for (const stage of ["prewriting", "writing", "evaluating", "feedback", "revising", "re_evaluating", "compared", "finished"]) {
    assert.equal(isSupportedSession({ activity: "deep", stage }), true);
    assert.equal(isSupportedSession({ activity: "quick", stage }), false);
  }
  for (const activity of ["deep", "quick", "future", null]) {
    assert.equal(isSupportedSession({ activity, stage: "quick" }), false);
    assert.equal(isSupportedSession({ activity, stage: "future" }), false);
  }
  assert.equal(isSupportedSession({ activity: "future", stage: "writing" }), false);
  assert.equal(isSupportedSession(readSession(JSON.stringify(legacySession()))), true);
});
