"use client";

import { useEffect, useState } from "react";
import { countWords } from "@/lib/rules";

const key = (id: string, kind: string) => `p0:pace:${id}:${kind}`;
/** A pause longer than this is not counted as writing time. */
const IDLE_MS = 60_000;
let last: { key: string; at: number } | null = null;

/** Add the time since the previous keystroke to the paragraph being typed in. Kept on this device only. */
export function recordTyping(id: string, kind: string, text: string, caret: number) {
  const storage = key(id, kind), now = Date.now();
  const gap = last?.key === storage ? now - last.at : 0;
  last = { key: storage, at: now };
  if (gap <= 0 || gap > IDLE_MS) return;
  const paragraph = Math.max(0, text.slice(0, caret).split(/\n+/).filter((p) => p.trim()).length - 1);
  try {
    const seconds: number[] = JSON.parse(localStorage.getItem(storage) ?? "[]");
    seconds[paragraph] = (seconds[paragraph] ?? 0) + gap / 1000;
    localStorage.setItem(storage, JSON.stringify(Array.from(seconds, (value) => Math.round((value ?? 0) * 10) / 10)));
  } catch { /* Timing is an aid; when storage is unavailable it is simply not shown. */ }
}

const clock = (seconds: number) => (seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ${Math.round(seconds % 60)} 秒` : `${Math.round(seconds)} 秒`);

/** 用时观察: how long each paragraph of the submitted draft took to type. It shows when typing happened, nothing more. */
export function PaceSummary({ id, kind, text }: { id: string; kind: string; text: string }) {
  const [seconds, setSeconds] = useState<number[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads this device's storage once after mount
    try { setSeconds(JSON.parse(localStorage.getItem(key(id, kind)) ?? "[]")); } catch { /* nothing recorded */ }
  }, [id, kind]);
  const paragraphs = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const rows = paragraphs.map((paragraph, i) => ({ words: countWords(paragraph), seconds: seconds[i] ?? 0 }));
  const longest = Math.max(...rows.map((row) => row.seconds), 0);
  if (longest < 5) return null;
  return (
    <section className="motion-reveal mt-7">
      <h2 className="flex items-baseline justify-between text-[15px] font-semibold">各段用时<span className="text-xs font-normal text-faint">只记录在这台设备上</span></h2>
      <ol className="mt-2.5 flex flex-col gap-2">
        {rows.map((row, i) => (
          <li key={i} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 text-[14px]">
            <span className="text-muted-foreground">第 {i + 1} 段</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-sunk" aria-hidden><span className="motion-fill block h-full rounded-full bg-primary/55" style={{ width: `${(row.seconds / longest) * 100}%`, "--i": i } as React.CSSProperties} /></span>
            <span className="text-right tabular-nums">{clock(row.seconds)}<span className="ml-2 text-muted-foreground">{row.words} 词</span></span>
          </li>
        ))}
      </ol>
    </section>
  );
}
