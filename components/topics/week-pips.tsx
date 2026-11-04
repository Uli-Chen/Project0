"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const KEY = "p0:week-seen";

/**
 * 本周进度格。比上次看到时多完成的格子会从左到右填上一次；
 * 第一次打开或读不到记录时直接显示，不做动画。
 */
export function WeekPips({ week, perWeek, weekKey }: { week: number; perWeek: number; weekKey: string }) {
  const [seen, setSeen] = useState<number | null>(null);
  useEffect(() => {
    let previous = week;
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as { week: string; count: number } | null;
      if (saved?.week === weekKey && saved.count < week) previous = saved.count;
      localStorage.setItem(KEY, JSON.stringify({ week: weekKey, count: week }));
    } catch { /* 只是一个展示上的便利，读不到就不动画 */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads per-viewer storage once after mount
    setSeen(previous);
  }, [week, weekKey]);

  const total = Math.min(perWeek, 14);
  return (
    <div className="mt-2 flex justify-end gap-1" aria-hidden>
      {Array.from({ length: total }, (_, i) => {
        const done = i < week;
        const fresh = done && seen !== null && i >= seen;
        return (
          <span key={i} className="relative h-1.5 w-6 overflow-hidden rounded-full bg-input">
            {done && <span className={cn("absolute inset-0 rounded-full bg-primary", fresh && "motion-fill")} style={fresh ? { "--i": i - seen! } as React.CSSProperties : undefined} />}
          </span>
        );
      })}
    </div>
  );
}
