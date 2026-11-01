import assert from "node:assert/strict";
import { test } from "node:test";
import { jsx } from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckpointClock } from "../../components/checkpoints/clock";
const timing = { sessionId: "owned-session", deadlineAt: "2026-11-01T00:40:00Z", serverNow: "2026-11-01T00:20:00Z" };
test("checkpoint waits for server acceptance, then replaces countdown with submitted status", () => {
  const writing = renderToStaticMarkup(jsx(CheckpointClock, timing));
  assert.match(writing, /role="timer"/); assert.match(writing, /20:00/);
  const submitted = renderToStaticMarkup(jsx(CheckpointClock, { ...timing, originalSubmittedAt: "2026-11-01T00:39:59Z" }));
  assert.match(submitted, /已提交，计时结束/); assert.match(submitted, /等待评分不会占用作答时间/); assert.ok(!submitted.includes('role="timer"')); assert.ok(!submitted.includes("剩余"));
  const late = renderToStaticMarkup(jsx(CheckpointClock, { ...timing, originalSubmittedAt: "2026-11-01T00:40:01Z" }));
  assert.match(late, /截止后提交/); assert.match(late, /不计入基线与趋势/);
});
