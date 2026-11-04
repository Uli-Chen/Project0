"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import type { Dim, Scores } from "@/lib/prototype/types";
import { cn } from "@/lib/utils";

export const DIM_LABEL: Record<Dim, string> = { TR: "任务回应", CC: "连贯与衔接", LR: "词汇", GRA: "语法" };
export const DIMS: Dim[] = ["TR", "CC", "LR", "GRA"];

export function ScoreCard({ scores, label }: { scores: Scores; label: string }) {
  const [open, setOpen] = useState(false);
  const rationaleId = useId();
  const weakest = DIMS.reduce((low, d) => (scores.dims[d] < scores.dims[low] ? d : low), DIMS[0]);
  const spread = DIMS.some((d) => scores.dims[d] !== scores.dims[weakest]);
  return (
    <section>
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-end gap-4">
        <p className="font-serif text-[56px] leading-[0.95] font-medium tracking-tight tabular-nums">{scores.overall.toFixed(1)}</p>
        {spread && <p className="pb-1.5 text-[13px] leading-snug text-muted-foreground">最弱的一项是<br /><span className="font-semibold text-foreground">{DIM_LABEL[weakest]}</span></p>}
      </div>
      <dl className="mt-5 flex flex-col gap-2.5">
        {DIMS.map((d) => (
          <div key={d} className="grid grid-cols-[84px_1fr_32px] items-center gap-2.5 text-[13px]">
            <dt className="text-muted-foreground">{DIM_LABEL[d]}</dt>
            <span className="h-1.5 overflow-hidden rounded-full bg-sunk shadow-[inset_0_0_0_1px_var(--border)]" aria-hidden>
              <span className={cn("block h-full rounded-full", spread && d === weakest ? "bg-[#e58c8a]" : "bg-faint")} style={{ width: `${(scores.dims[d] / 9) * 100}%` }} />
            </span>
            <dd className="text-right font-medium tabular-nums">{scores.dims[d].toFixed(1)}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-faint">AI 实验性预估，非官方成绩</p>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={rationaleId} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          评分依据
          <ChevronDown className={cn("size-3.5 transition-transform duration-(--dur-layout) ease-(--ease-soft)", open && "rotate-180")} />
        </button>
      </div>
      {open && (
        <div id={rationaleId} className="motion-expand"><div>
        <dl className="mt-3 flex flex-col gap-3 rounded-lg bg-sunk p-3.5 text-[13px] shadow-[inset_0_0_0_1px_var(--border)]">
          {DIMS.map((d) => (
            <div key={d}>
              <dt className="font-medium">{DIM_LABEL[d]}</dt>
              <dd className="mt-0.5 leading-relaxed text-muted-foreground">{scores.rationale[d]}</dd>
            </div>
          ))}
        </dl>
        </div></div>
      )}
    </section>
  );
}
