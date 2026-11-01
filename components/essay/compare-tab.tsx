"use client";

import { ArrowRight, Check } from "lucide-react";
import { useMemo, useState } from "react";
import { IssueBadge } from "@/components/feedback/issue-list";
import { DIM_LABEL, DIMS } from "@/components/feedback/score-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { splitSentences } from "@/lib/rules";
import { useSession } from "@/lib/prototype/session-store";
import { cn } from "@/lib/utils";
import { useEssayUi } from "./essay-ui";
import { FinishSummary } from "./finish-summary";

const STATUS = {
  resolved: { label: "已解决", className: "text-good" },
  partly: { label: "解决了一部分", className: "text-warn" },
  unresolved: { label: "还没解决", className: "text-destructive" },
  removed: { label: "相关句子已删除", className: "text-muted-foreground" },
} as const;

const delta = (a: number, b: number) => (b - a === 0 ? "±0" : `${b > a ? "+" : ""}${(b - a).toFixed(1)}`);

export function CompareTab() {
  const { state, actions } = useSession();
  const ui = useEssayUi();
  const original = state.submitted.original ?? "";
  const revision = state.submitted.revision ?? "";
  const origSentences = useMemo(() => splitSentences(original), [original]);
  const revSentences = useMemo(() => splitSentences(revision), [revision]);
  const before = state.evaluation?.scores;
  const after = state.revisionScores;
  const comparison = state.comparison;
  if (!before || !after || !comparison) return null;
  const issues = state.evaluation?.issues ?? [];

  return (
    <div className="h-full overflow-y-auto px-5 pt-5 pb-10">
      {state.finish && <div className="mb-8"><FinishSummary /></div>}

      <section>
        <p className="text-xs text-muted-foreground">原稿 → 改写稿</p>
        <p className="mt-1.5 flex items-center gap-2.5 font-mono text-[40px] leading-none tracking-tighter tabular-nums">
          <span className="text-muted-foreground">{before.overall.toFixed(1)}</span>
          <ArrowRight className="size-5 text-muted-foreground/60" />
          {after.overall.toFixed(1)}
        </p>
        <dl className="mt-5 flex flex-col divide-y border-y text-[13px]">
          {DIMS.map((d) => (
            <div key={d} className="flex items-center justify-between py-1.5 font-mono tabular-nums">
              <dt className="font-sans text-muted-foreground">{DIM_LABEL[d]}</dt>
              <dd>
                {before.dims[d].toFixed(1)} → {after.dims[d].toFixed(1)}
                <span className={cn("ml-2 inline-block w-8 text-right text-xs", after.dims[d] > before.dims[d] ? "text-good" : after.dims[d] < before.dims[d] ? "text-destructive" : "text-muted-foreground")}>{delta(before.dims[d], after.dims[d])}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="meta mt-2.5 text-[11px]">AI 实验性预估，非官方成绩</p>
      </section>

      <section className="mt-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs text-muted-foreground">问题处理</h2>
          <ToggleGroup size="sm" spacing={0} variant="outline" value={[ui.compareMode]} onValueChange={(value) => { if (value[0]) ui.setCompareMode(value[0] as "diff" | "marks"); }} aria-label="正文显示">
            <ToggleGroupItem value="diff" className="h-6 px-2 text-xs">修订痕迹</ToggleGroupItem>
            <ToggleGroupItem value="marks" className="h-6 px-2 text-xs">问题句</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <ol className="flex flex-col divide-y border-y">
          {comparison.issues.map((result) => {
            const issue = issues.find((item) => item.rank === result.rank);
            const active = ui.compareMode === "marks" && state.activeIssue === result.rank;
            return (
              <li key={result.rank}>
                <button type="button" aria-pressed={active} onClick={() => { actions.setActiveIssue(result.rank); ui.setCompareMode("marks"); ui.setVersion("revision"); if (result.revisionSentenceIds[0]) ui.jumpToSentence(result.revisionSentenceIds[0]); }}
                  className={cn("flex w-full items-start gap-2.5 py-3 text-left", active && "bg-secondary/40")}>
                  <IssueBadge rank={result.rank} className="mt-px" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium">{issue?.title}</span>
                      <span className={cn("shrink-0 text-xs font-medium", STATUS[result.status].className)}>{STATUS[result.status].label}</span>
                    </span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-muted-foreground">{result.reason}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="mt-8">
        <h2 className="text-xs text-muted-foreground">观点</h2>
        <p className="mt-2.5 flex items-center gap-2 text-[13px]"><Check className={cn("size-4", comparison.idea.stanceKept ? "text-good" : "text-warn")} />{comparison.idea.stanceKept ? "立场没有变" : "立场有变化"}</p>
        {comparison.idea.keptPoints.length > 0 && <ul className="mt-2 flex flex-col gap-1 text-[13px] text-foreground/80">{comparison.idea.keptPoints.map((p) => <li key={p} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-foreground/40" />{p}</li>)}</ul>}
        {comparison.idea.deepened.map((d) => (
          <div key={d.what} className="mt-4">
            <p className="text-[13px]">{d.what}</p>
            <p className="mt-1.5 border-l-2 pl-3 font-serif text-sm italic leading-relaxed text-muted-foreground">{d.originalIds.map((id) => origSentences.find((s) => s.id === id)?.text).join(" ")}</p>
            <p className="mt-1 border-l-2 border-foreground/60 pl-3 font-serif text-sm leading-relaxed">{d.revisionIds.map((id) => revSentences.find((s) => s.id === id)?.text).join(" ")}</p>
          </div>
        ))}
        {comparison.idea.changed.length > 0 && <ul className="mt-4 text-[13px] text-muted-foreground">{comparison.idea.changed.map((c) => <li key={c}>{c}</li>)}</ul>}
        <div className="mt-4 flex items-baseline justify-between gap-3 text-[13px]"><span className="text-xs text-muted-foreground">站内已采用建议文本占比</span><span className="font-mono tabular-nums">{Math.round(comparison.aiRatio * 100)}%</span></div>
        <p className="mt-1 text-xs text-muted-foreground">按已采用且仍完整保留的站内建议文本词数估算；不检测 AI 生成，也不识别外部来源。</p>
      </section>

      <Rating />
    </div>
  );
}

function Rating() {
  const { state, actions, coachBusy, lifecycleBusy } = useSession();
  const [useful, setUseful] = useState<string | null>(null);
  const [mine, setMine] = useState<"yes" | "partly" | "no" | null>(null);
  const [comment, setComment] = useState("");
  if (state.rating) return <p className="mt-8 text-xs text-muted-foreground">评价已提交</p>;
  return (
    <section className="mt-8 flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="text-xs text-muted-foreground">评价这次练习</h2>
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span>有用吗</span>
        <ToggleGroup disabled={state.lifecycle !== "open" || lifecycleBusy} size="sm" spacing={0} variant="outline" value={useful ? [useful] : []} onValueChange={(value) => setUseful(value[0] ?? null)} aria-label="有用程度">
          {["1", "2", "3", "4", "5"].map((v) => <ToggleGroupItem key={v} value={v} className="h-6 w-7 px-0 font-mono text-xs">{v}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span>还是你的观点吗</span>
        <ToggleGroup disabled={state.lifecycle !== "open" || lifecycleBusy} size="sm" spacing={0} variant="outline" value={mine ? [mine] : []} onValueChange={(value) => setMine((value[0] as typeof mine) ?? null)} aria-label="观点归属">
          {([["yes", "是"], ["partly", "部分"], ["no", "不是"]] as const).map(([v, label]) => <ToggleGroupItem key={v} value={v} className="h-6 px-2 text-xs">{label}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>
      <Textarea disabled={state.lifecycle !== "open" || lifecycleBusy} value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="其他想说的（可选）" className="min-h-0 resize-none text-[13px]" />
      <Button size="sm" variant="outline" className="self-end" disabled={coachBusy || lifecycleBusy || state.lifecycle !== "open" || (!useful && !mine)} onClick={() => void actions.rate(useful ? Number(useful) : null, mine, comment)}>提交</Button>
    </section>
  );
}
