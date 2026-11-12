"use client";

import { useCallback, useState } from "react";
import { DIM_LABEL, DIMS } from "@/components/feedback/score-card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Dim } from "@/lib/prototype/types";

// 所有系列跟随主题；数据表提供不依赖颜色与悬停的阅读方式。
const SERIES = { original: "var(--muted-foreground)", revision: "var(--foreground)" };
const Y_MIN = 0;
const Y_MAX = 9;
const TICKS = [0, 3, 6, 9];
// The SVG is drawn at its real pixel width (one viewBox unit = one CSS pixel), so this is the
// size the text is actually shown at. Narrow charts drop labels instead of shrinking them.
const AXIS_FONT = 13;
const LABEL_SPACING = 64;

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

type MockPoint = { date: string; label: string; overall: number; dims: Record<Dim, number> };
type Tip = { x: number; y: number; lines: string[] } | null;

export function MockScoreChart({ points: allPoints, target }: { points: MockPoint[]; target?: number }) {
  const [metric, setMetric] = useState<"overall" | Dim>("overall");
  const [tip, setTip] = useState<Tip>(null);
  const [measure, W] = useChartWidth();
  const points = allPoints.slice(-12);
  const H = 240;
  const pad = { l: 36, r: 64, t: 16, b: 36 };
  const x = (i: number) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (points.length - 1));
  // Every `step`-th label counted back from the latest, so the newest point is always labelled.
  const step = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor((W - pad.l - pad.r) / LABEL_SPACING))));
  const y = (v: number) => pad.t + ((Y_MAX - v) / (Y_MAX - Y_MIN)) * (H - pad.t - pad.b);
  const value = (p: MockPoint) => (metric === "overall" ? p.overall : p.dims[metric]);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(value(p))}`).join(" ");
  const last = points.at(-1)!;

  return (
    <div>
      <ToggleGroup aria-label="评分维度" size="sm" variant="outline" spacing={0} value={[metric]} onValueChange={(value) => { if (value[0]) setMetric(value[0] as "overall" | Dim); }}>
        {[{ value: "overall" as const, label: "总分" }, ...DIMS.map((d) => ({ value: d, label: DIM_LABEL[d] }))].map((option) => <ToggleGroupItem key={option.value} value={option.value} className="px-2.5 text-[14px]">{option.label}</ToggleGroupItem>)}
      </ToggleGroup>
      <div ref={measure} className="relative mt-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full tabular-nums" role="img" aria-label="模考成绩变化">
          {TICKS.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
              <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={AXIS_FONT} fill="var(--muted-foreground)">
                {t.toFixed(1)}
              </text>
            </g>
          ))}
          {target !== undefined && <><line x1={pad.l} x2={W - pad.r} y1={y(target)} y2={y(target)} stroke="var(--foreground)" strokeOpacity={0.35} strokeWidth={1} />
          <text x={W - pad.r + 6} y={y(target)} dy="0.32em" fontSize={AXIS_FONT} fill="var(--muted-foreground)">
            目标 {target}
          </text></>}
          <path d={path} fill="none" stroke={SERIES.revision} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => (
            <g key={`${p.date}-${i}`}>
              <circle cx={x(i)} cy={y(value(p))} r={5} fill={SERIES.revision} stroke="var(--background)" strokeWidth={2} />
              <circle
                cx={x(i)}
                cy={y(value(p))}
                r={16}
                fill="transparent"
                tabIndex={0}
                aria-label={`${p.label} ${p.date}: ${value(p).toFixed(1)} 分`}
                onFocus={() => setTip({ x: (x(i) / W) * 100, y: y(value(p)), lines: [`${formatChartDate(p.date)} ${p.label}`, value(p).toFixed(1)] })}
                onBlur={() => setTip(null)}
                onMouseEnter={() => setTip({ x: (x(i) / W) * 100, y: y(value(p)), lines: [`${formatChartDate(p.date)} ${p.label}`, value(p).toFixed(1)] })}
                onMouseLeave={() => setTip(null)}
              />
              {(points.length - 1 - i) % step === 0 && <text x={x(i)} y={H - 12} textAnchor="middle" fontSize={AXIS_FONT} fill="var(--muted-foreground)">
                {p.label}
              </text>}
            </g>
          ))}
          <text x={x(points.length - 1) + 10} y={y(value(last))} dy="0.32em" fontSize={AXIS_FONT} fontWeight={600} fill="var(--foreground)">
            {value(last).toFixed(1)}
          </text>
        </svg>
        <PercentTooltip tip={tip} />
      </div>
      {allPoints.length > 12 && <p className="mt-2 text-[14px] text-muted-foreground">仅显示最近 12 篇</p>}
      <ScoreDataTable caption="独立模考成绩" headings={["日期", "总分", ...DIMS.map((dim) => DIM_LABEL[dim])]} rows={allPoints.map((point) => [fullDate(point.date), point.overall.toFixed(1), ...DIMS.map((dim) => point.dims[dim].toFixed(1))])} />
    </div>
  );
}

/** 坐标以百分比存放，按容器宽度定位 */
function PercentTooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-foreground px-2.5 py-1.5 text-[14px] text-background"
      style={{ left: `${tip.x}%`, top: `calc(${(tip.y / 240) * 100}% - 10px)` }}
    >
      {tip.lines.map((l, i) => (
        <p key={i} className={i === 0 ? "opacity-70" : "tabular-nums"}>
          {l}
        </p>
      ))}
    </div>
  );
}

export function PracticeDumbbell({ rows: allRows }: { rows: Array<{ date: string; original: number; revision: number }> }) {
  const [tip, setTip] = useState<Tip>(null);
  const [measure, W] = useChartWidth();
  const rows = allRows.slice(-12);
  const rowH = 40;
  const pad = { l: 92, r: 24, t: 8, b: 28 };
  const H = pad.t + rows.length * rowH + pad.b;
  const x = (v: number) => pad.l + ((v - Y_MIN) / (Y_MAX - Y_MIN)) * (W - pad.l - pad.r);

  return (
    <div>
      <div className="flex gap-5 text-[14px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: SERIES.original }} />
          原稿
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: SERIES.revision }} />
          改写稿
        </span>
      </div>
      <div ref={measure} className="relative mt-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full tabular-nums" role="img" aria-label="练习成绩：原稿与改写稿">
          {TICKS.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={pad.t} y2={H - pad.b} stroke="var(--border)" strokeWidth={1} />
              <text x={x(t)} y={H - 8} textAnchor="middle" fontSize={AXIS_FONT} fill="var(--muted-foreground)">
                {t.toFixed(1)}
              </text>
            </g>
          ))}
          {rows.map((r, i) => {
            const cy = pad.t + i * rowH + rowH / 2;
            return (
              <g
                key={`${r.date}-${i}`}
                tabIndex={0}
                aria-label={`${formatChartDate(r.date)} 原稿 ${r.original} 分，改写稿 ${r.revision} 分`}
                onFocus={() => setTip({ x: (x(r.revision) / W) * 100, y: cy, lines: [formatChartDate(r.date), `原稿 ${r.original.toFixed(1)}，改写稿 ${r.revision.toFixed(1)}`] })}
                onBlur={() => setTip(null)}
                onMouseEnter={() => setTip({ x: (x(r.revision) / W) * 100, y: cy, lines: [formatChartDate(r.date), `原稿 ${r.original.toFixed(1)}，改写稿 ${r.revision.toFixed(1)}`] })}
                onMouseLeave={() => setTip(null)}
              >
                <rect x={0} y={cy - rowH / 2} width={W} height={rowH} fill="transparent" />
                <text x={0} y={cy} dy="0.32em" fontSize={AXIS_FONT} fill="var(--muted-foreground)">
                  {formatChartDate(r.date)}
                </text>
                <line x1={x(r.original)} x2={x(r.revision)} y1={cy} y2={cy} stroke="var(--foreground)" strokeOpacity={0.25} strokeWidth={2} />
                <circle cx={x(r.original)} cy={cy} r={5} fill={SERIES.original} stroke="var(--background)" strokeWidth={2} />
                <circle cx={x(r.revision)} cy={cy} r={5} fill={SERIES.revision} stroke="var(--background)" strokeWidth={2} />
              </g>
            );
          })}
        </svg>
        {tip && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-foreground px-2.5 py-1.5 text-[14px] text-background"
            style={{ left: `${tip.x}%`, top: `calc(${(tip.y / H) * 100}% - 12px)` }}
          >
            <p className="opacity-70">{tip.lines[0]}</p>
            <p className="tabular-nums">{tip.lines[1]}</p>
          </div>
        )}
      </div>
      {allRows.length > 12 && <p className="mt-2 text-[14px] text-muted-foreground">仅显示最近 12 篇</p>}
      <ScoreDataTable caption="原稿与改写稿成绩" headings={["日期", "原稿", "改写稿"]} rows={allRows.map((row) => [fullDate(row.date), row.original.toFixed(1), row.revision.toFixed(1)])} />
    </div>
  );
}

function fullDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", { timeZone: "Asia/Taipei" });
}

function ScoreDataTable({ caption, headings, rows }: { caption: string; headings: string[]; rows: string[][] }) {
  return <details className="mt-5 text-[14px]">
    <summary className="w-fit cursor-pointer rounded-sm py-1 text-muted-foreground hover:text-foreground">数据表</summary>
    <div className="mt-3 max-w-full overflow-x-auto">
      <table className="w-full min-w-max text-left tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead><tr>{headings.map((heading) => <th key={heading} scope="col" className="border-b px-2 py-2 font-medium text-muted-foreground first:pl-0">{heading}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}>{row.map((value, column) => <td key={column} className="border-b px-2 py-2 first:pl-0">{value}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </details>;
}

function formatChartDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", { timeZone: "Asia/Taipei", month: "short", day: "numeric" });
}
