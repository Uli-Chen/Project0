import assert from "node:assert/strict";
import { test } from "node:test";
import { jsx } from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { MockScoreChart, PracticeDumbbell, tickLabels } from "../../components/pages/progress-charts";

const dims = { TR: 6, CC: 6, LR: 5.5, GRA: 6 };
const sizes = (html: string) => [...html.matchAll(/font-size="(\d+(?:\.\d+)?)"/g)].map(match => Number(match[1]));

test("chart text is at least 14px; narrow axes drop value labels instead of shrinking them", () => {
  const mock = renderToStaticMarkup(jsx(MockScoreChart, { points: [1, 2, 3].map(i => ({ date: `2026-11-0${i}T00:00:00Z`, label: `第 ${i} 篇`, overall: 5 + i / 2, dims })), target: 6.5 }));
  const dumbbell = renderToStaticMarkup(jsx(PracticeDumbbell, { rows: [{ date: "2026-11-01T00:00:00Z", original: 5.5, revision: 6 }] }));
  for (const html of [mock, dumbbell]) {
    assert.ok(sizes(html).length > 0);
    assert.ok(sizes(html).every(size => size >= 14), `font sizes ${sizes(html).join(",")}`);
  }
  assert.deepEqual(tickLabels(400), [0, 3, 6, 9]);
  assert.deepEqual(tickLabels(100), [0, 9]);
});
