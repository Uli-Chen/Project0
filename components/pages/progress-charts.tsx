"use client";

import { useCallback, useState, type CSSProperties } from "react";
import { DIM_LABEL, DIMS } from "@/components/feedback/score-card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Dim } from "@/lib/prototype/types";

// 所有系列跟随主题；每一篇的数值可以用悬停或方向键读到，不只靠颜色和位置。
const SERIES = { original: "var(--muted-foreground)", revision: "var(--foreground)" };
const Y_MAX = 9;
// The SVG is drawn at its real pixel width (one viewBox unit = one CSS pixel), so this is the
// size the text is actually shown at. Narrow charts drop labels instead of shrinking them.
export const AXIS_FONT = 14;
const LABEL_SPACING = 72;

/** Width of the chart's container in CSS pixels; desktop width until it has been measured. */
function useChartWidth(fallback = 640) {
  const [width, setWidth] = useState<number | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0) setWidth(Math.round(entry.contentRect.width)); });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width ?? fallback] as const;
}

export type ScorePoint = { date: string; label: string; overall: number; dims: Record<Dim, number>; revised?: { overall: number; dims: Record<Dim, number> } };
type Metric = "overall" | Dim;
type Range = "30" | "90" | "all";
const RANGES: { value: Range; label: string }[] = [{ value: "30", label: "近 30 天" }, { value: "90", label: "近 90 天" }, { value: "all", label: "全部" }];
const DAY = 86_400_000;
// SVG 元素的 transform-origin 默认在用户坐标原点；pop 缩放需要各自的包围盒
const POP: CSSProperties = { transformBox: "fill-box", transformOrigin: "center" };
const H = 240;

/**
 * 成绩走势：一条原稿成绩的折线，改写过的那一篇在同一位置再标出改写后的分数。
 * 数据会越积越多，所以按时段看（近 30 天 / 近 90 天 / 全部）；点多了先缩小、再只留折线，悬停或方向键读每一篇。
 */
export function MockScoreChart({ points: all, target, summary = false }: { points: ScorePoint[]; target?: number; summary?: boolean }) {
  const [metric, setMetric] = useState<Metric>("overall");
  // 以“今天”为终点；按天取整，服务端和浏览器渲染出的时段一致
  const [today] = useState(() => Math.floor(Date.now() / DAY) * DAY + DAY);
  // 记录多、跨度长时默认只看近 90 天，否则直接看全部
  const [range, setRange] = useState<Range>(() => (all.length > 30 && all.some((p) => today - new Date(p.date).getTime() > 90 * DAY) ? "90" : "all"));
  const [active, setActive] = useState<number | null>(null);
  const [measure, W] = useChartWidth();
  const points = range === "all" ? all : all.filter((p) => today - new Date(p.date).getTime() <= Number(range) * DAY);
  const n = points.length;
  const pad = { l: 36, r: 72, t: 16, b: 36 };
  const x = (i: number) => pad.l + (n === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (n - 1));
  // Every `step`-th label counted back from the latest, so the newest point is always labelled.
  const step = Math.max(1, Math.ceil(n / Math.max(1, Math.floor((W - pad.l - pad.r) / LABEL_SPACING))));
  const value = (p: ScorePoint) => (metric === "overall" ? p.overall : p.dims[metric]);
  const revised = (p: ScorePoint) => (p.revised ? (metric === "overall" ? p.revised.overall : p.revised.dims[metric]) : null);
  // 分数多在 4 分以上：都不低于 4 时纵轴从 3 起，把变化看清楚；有更低的分数就回到 0
  const low = Math.min(target ?? Y_MAX, ...points.flatMap((p) => [value(p), revised(p) ?? Y_MAX])) >= 4 ? 3 : 0;
  const ticks = low === 3 ? [3, 5, 7, 9] : [0, 3, 6, 9];
  const y = (v: number) => pad.t + ((Y_MAX - v) / (Y_MAX - low)) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(value(p))}`).join(" ");
  const last = points.at(-1);
  // The latest score and the target share the right margin; when they would overlap, keep the target.
  const showLast = !!last && (target === undefined || Math.abs(y(value(last)) - y(target)) >= AXIS_FONT + 2);
  // 点多了就让位给折线：30 个以内是完整的点，80 个以内缩成小点，再多只画线
  const dot = n <= 30 ? 4.5 : n <= 80 ? 2.5 : 0;
  const rewrites = points.filter((p) => p.revised);
  const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
  const current = active !== null && active < n ? points[active] : null;
  const describe = (p: ScorePoint) => `${formatChartDate(p.date)} ${p.label}：${value(p).toFixed(1)} 分${revised(p) !== null ? `，改写后 ${revised(p)!.toFixed(1)} 分` : ""}`;
  const nearest = (clientX: number, box: DOMRect) => (n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round((((clientX - box.left) / box.width) * W - pad.l) / ((W - pad.l - pad.r) / (n - 1))))));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
        <ToggleGroup aria-label="评分维度" size="sm" variant="outline" spacing={0} value={[metric]} onValueChange={(next) => { if (next[0]) { setActive(null); setMetric(next[0] as Metric); } }}>
          {[{ value: "overall" as const, label: "总分" }, ...DIMS.map((d) => ({ value: d, label: DIM_LABEL[d] }))].map((option) => <ToggleGroupItem key={option.value} value={option.value} className="px-2.5 text-[14px]">{option.label}</ToggleGroupItem>)}
        </ToggleGroup>
        <ToggleGroup aria-label="时段" size="sm" variant="outline" spacing={0} value={[range]} onValueChange={(next) => { if (next[0]) { setActive(null); setRange(next[0] as Range); } }}>
          {RANGES.map((option) => <ToggleGroupItem key={option.value} value={option.value} className="px-2.5 text-[14px]">{option.label}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>

      {summary && n > 0 && (
        <dl key={`${metric}-${range}`} className="motion-swap mt-5 flex flex-wrap gap-x-10 gap-y-3">
          <Figure label={`${n} 篇的平均`} value={mean(points.map(value)).toFixed(1)} />
          <Figure label="最高" value={Math.max(...points.map(value)).toFixed(1)} />
          {rewrites.length > 0 && <Figure label="改写后平均提升" value={signed(mean(rewrites.map((p) => revised(p)! - value(p))))} tone={mean(rewrites.map((p) => revised(p)! - value(p)))} />}
        </dl>
      )}

      {n === 0 ? <p className="flex h-44 items-center justify-center text-[15px] text-muted-foreground">这个时段没有成绩</p> : (
        <div
          ref={measure}
          className="relative mt-4 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          tabIndex={0}
          role="group"
          aria-label="成绩走势，用左右方向键逐篇查看"
          onKeyDown={(event) => {
            const next = event.key === "ArrowRight" ? Math.min(n - 1, (active ?? -1) + 1) : event.key === "ArrowLeft" ? Math.max(0, (active ?? n) - 1) : event.key === "Home" ? 0 : event.key === "End" ? n - 1 : null;
            if (next === null) return;
            event.preventDefault();
            setActive(next);
          }}
          onBlur={() => setActive(null)}
        >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full tabular-nums"
            role="img"
            aria-label={`${n} 篇成绩，最近一篇 ${value(last!).toFixed(1)} 分`}
            onMouseMove={(event) => setActive(nearest(event.clientX, event.currentTarget.getBoundingClientRect()))}
            onMouseLeave={() => setActive(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
                <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={AXIS_FONT} fill="var(--faint)">
                  {t.toFixed(1)}
                </text>
              </g>
            ))}
            {target !== undefined && <g className="motion-swap" style={{ animationDelay: "620ms" }}><line x1={pad.l} x2={W - pad.r} y1={y(target)} y2={y(target)} stroke="var(--coach)" strokeOpacity={0.55} strokeWidth={1} strokeDasharray="4 4" />
            <text x={W - pad.r + 6} y={y(target)} dy="0.32em" fontSize={AXIS_FONT} fill="var(--coach)">
              目标 {target}
            </text></g>}
            {current && <line x1={x(active!)} x2={x(active!)} y1={pad.t} y2={H - pad.b} stroke="var(--coach-line)" strokeWidth={1} />}
            <g key={`${metric}-${range}`}>
              <path d={path} pathLength={1} fill="none" stroke={SERIES.revision} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="motion-line" style={{ "--delay": "80ms" } as CSSProperties} />
              {points.map((p, i) => {
                const after = revised(p);
                return (
                  <g key={`${p.date}-${i}`}>
                    {after !== null && after !== value(p) && <line x1={x(i)} x2={x(i)} y1={y(value(p))} y2={y(after)} stroke="var(--coach)" strokeOpacity={0.45} strokeWidth={2} strokeLinecap="round" className="motion-swap" style={{ animationDelay: "520ms" }} />}
                    {dot > 0 && <circle cx={x(i)} cy={y(value(p))} r={dot} fill={SERIES.revision} stroke="var(--background)" strokeWidth={n <= 30 ? 2 : 0} className="motion-pop" style={{ ...POP, "--i": i, "--delay": "160ms" } as CSSProperties} />}
                    {after !== null && <circle cx={x(i)} cy={y(after)} r={Math.max(dot, 3) - 0.5} fill="var(--background)" stroke="var(--coach)" strokeWidth={1.75} className="motion-pop" style={{ ...POP, "--i": i, "--delay": "420ms" } as CSSProperties} />}
                    {(n - 1 - i) % step === 0 && <text x={x(i)} y={H - 12} textAnchor="middle" fontSize={AXIS_FONT} fill="var(--faint)">
                      {p.label}
                    </text>}
                  </g>
                );
              })}
              {current && <circle cx={x(active!)} cy={y(value(current))} r={Math.max(dot, 3) + 4} fill="none" stroke="var(--coach)" strokeWidth={1.5} />}
              {showLast && <text x={x(n - 1) + 10} y={y(value(last!))} dy="0.32em" fontSize={AXIS_FONT} fontWeight={600} fill="var(--foreground)" className="motion-swap" style={{ animationDelay: "620ms" }}>
                {value(last!).toFixed(1)}
              </text>}
            </g>
          </svg>
          {current && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-foreground px-2.5 py-1.5 text-[13px] leading-snug whitespace-nowrap text-background shadow-float"
              style={{ left: `${Math.min(88, Math.max(12, (x(active!) / W) * 100))}%`, top: `calc(${(Math.min(y(value(current)), y(revised(current) ?? value(current))) / H) * 100}% - 12px)` }}
            >
              <p className="opacity-70">{formatChartDate(current.date)} {current.label}</p>
              <p className="tabular-nums">{value(current).toFixed(1)}{revised(current) !== null && <span className="opacity-70"> → 改写后 </span>}{revised(current)?.toFixed(1)}</p>
            </div>
          )}
          <p className="sr-only" aria-live="polite">{current ? describe(current) : ""}</p>
        </div>
      )}

      {rewrites.length > 0 && (
        <p className="mt-1 flex items-center gap-5 text-[14px] text-muted-foreground" aria-hidden>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-foreground" />原稿</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border-[1.75px] border-coach" />改写后</span>
        </p>
      )}
    </div>
  );
}

const signed = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;

function Figure({ label, value, tone = 0 }: { label: string; value: string; tone?: number }) {
  return (
    <div>
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-[22px] leading-tight font-semibold tracking-[-0.02em] tabular-nums ${tone > 0 ? "text-good" : tone < 0 ? "text-warn" : ""}`}>{value}</dd>
    </div>
  );
}

function formatChartDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", { timeZone: "Asia/Taipei", month: "short", day: "numeric" });
}
