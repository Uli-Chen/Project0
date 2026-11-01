"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { Dim, Scores } from "@/lib/prototype/types";
import { cn } from "@/lib/utils";

export const DIM_LABEL: Record<Dim, string> = { TR: "任务回应", CC: "连贯与衔接", LR: "词汇", GRA: "语法" };
export const DIMS: Dim[] = ["TR", "CC", "LR", "GRA"];

export function ScoreCard({ scores, label }: { scores: Scores; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1.5 font-mono text-[44px] leading-none tracking-tighter tabular-nums">{scores.overall.toFixed(1)}</p>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          评分依据
          <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      <dl className="mt-5 grid grid-cols-4 gap-px overflow-hidden rounded-lg border bg-border">
        {DIMS.map((d) => (
          <div key={d} className="bg-sheet px-2.5 py-2">
            <dt className="truncate text-[11px] text-muted-foreground">{DIM_LABEL[d]}</dt>
            <dd className="mt-0.5 font-mono text-[15px] tabular-nums">{scores.dims[d].toFixed(1)}</dd>
          </div>
        ))}
      </dl>
      {open && (
        <dl className="mt-3 flex flex-col gap-3 rounded-lg bg-secondary/60 p-3.5 text-[13px] animate-in fade-in-0">
          {DIMS.map((d) => (
            <div key={d}>
              <dt className="font-medium">{DIM_LABEL[d]}</dt>
              <dd className="mt-0.5 leading-relaxed text-muted-foreground">{scores.rationale[d]}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="meta mt-2.5 text-[11px]">AI 实验性预估，非官方成绩</p>
    </section>
  );
}
