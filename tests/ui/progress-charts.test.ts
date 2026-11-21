import assert from "node:assert/strict";
import { test } from "node:test";
import { jsx } from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { MockScoreChart } from "../../components/pages/progress-charts";

const dims = { TR: 6, CC: 6, LR: 5.5, GRA: 6 };
const sizes = (html: string) => [...html.matchAll(/font-size="(\d+(?:\.\d+)?)"/g)].map(match => Number(match[1]));

test("chart text is at least 14px, with or without rewrites", () => {
  const points = [1, 2, 3].map(i => ({ date: `2026-11-0${i}T00:00:00Z`, label: `第 ${i} 篇`, overall: 5 + i / 2, dims }));
  const plain = renderToStaticMarkup(jsx(MockScoreChart, { points, target: 6.5 }));
  const rewritten = renderToStaticMarkup(jsx(MockScoreChart, { points: points.map((point, i) => i === 1 ? { ...point, revised: { overall: 6.5, dims } } : point), target: 6.5, summary: true }));
  for (const html of [plain, rewritten]) {
    assert.ok(sizes(html).length > 0);
    assert.ok(sizes(html).every(size => size >= 14), `font sizes ${sizes(html).join(",")}`);
  }
  assert.doesNotMatch(plain, /改写后/);
  assert.match(rewritten, /改写后平均提升/);
  assert.doesNotMatch(rewritten, /<table/);
});

test("a long history opens on the last 90 days and draws a line without a dot per essay", () => {
  const day = 86_400_000, now = Date.now();
  const points = Array.from({ length: 200 }, (_, i) => ({ date: new Date(now - (199 - i) * 2 * day).toISOString(), label: `第 ${i + 1} 篇`, overall: 6, dims }));
  const html = renderToStaticMarkup(jsx(MockScoreChart, { points }));
  assert.match(html, /aria-label="时段"/);
  const pressed = [...html.matchAll(/<button[^>]*aria-pressed="true"[^>]*>([^<]*)</g)].map(match => match[1]);
  assert.ok(pressed.includes("近 90 天"), `pressed: ${pressed.join(",")}`);
  // 90 days at one essay every two days is about 45 points: small dots, never 200 circles.
  assert.ok((html.match(/<circle/g) ?? []).length < 60);
});
