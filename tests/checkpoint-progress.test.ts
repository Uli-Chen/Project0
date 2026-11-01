import assert from "node:assert/strict";
import { test } from "node:test";
import { checkpointScorePoints } from "../lib/learning/checkpoints";
import { createSession } from "../lib/pipeline/initial";
import { evaluation } from "./helpers/practice-db";
test("checkpoint trend follows immutable completion chronology, never creation or edit order", () => {
  const earlyStart = createSession({ kind: "free", mode: "mock" }); earlyStart.createdAt = "2026-10-01T00:00:00Z"; earlyStart.evaluation = structuredClone(evaluation); earlyStart.evaluation.scores.overall = 6.5;
  const lateStart = createSession({ kind: "free", mode: "mock" }); lateStart.createdAt = "2026-11-01T00:00:00Z"; lateStart.evaluation = evaluation;
  const checkpoints = [
    { attemptId: earlyStart.id, completedAt: "2026-11-03T02:00:00Z", status: "eligible", isBaseline: false },
    { attemptId: lateStart.id, completedAt: "2026-11-01T16:01:00Z", status: "eligible", isBaseline: true },
    { attemptId: earlyStart.id, completedAt: "2026-10-01T00:00:00Z", status: "ineligible", isBaseline: false },
    { attemptId: "missing", completedAt: "2026-10-01T00:00:00Z", status: "eligible", isBaseline: false },
  ];
  const points = checkpointScorePoints([earlyStart, lateStart], checkpoints);
  assert.deepEqual(points.map(p => p.date), ["2026-11-01T16:01:00Z", "2026-11-03T02:00:00Z"]);
  assert.deepEqual(points.map(p => p.overall), [6, 6.5]); assert.equal(points[0].label, "基线");
  earlyStart.updatedAt = "2027-01-01T00:00:00Z"; assert.deepEqual(checkpointScorePoints([lateStart, earlyStart], checkpoints), points);
});
