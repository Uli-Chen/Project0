"use client";

import { ArrowRight, Download, LoaderCircle, MoreHorizontal, PanelLeft, PanelRight, PenLine, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { hasRevision } from "@/lib/learning/essay-view";
import { essayKindLabel } from "@/lib/learning/summary";
import { countWords } from "@/lib/rules";
import { useSession } from "@/lib/prototype/session-store";
import type { EssayKind } from "@/lib/prototype/types";
import { cn } from "@/lib/utils";
import { useEssayUi } from "./essay-ui";

export function formatClock(sec: number) {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

export function EssayTopbar({ onSubmit, hasLeft }: { onSubmit: () => void; hasLeft: boolean }) {
  const { state, actions, essayKind, saveStatus } = useSession();
  const ui = useEssayUi();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const { stage } = state;
  const editing = stage === "writing" || stage === "revising";
  const elapsed = state.elapsed[essayKind];
  const overtime = essayKind === "original" && elapsed > 2400;
  const assessment = state.kind === "assessment";
  const scores: Record<EssayKind, number | undefined> = { original: state.evaluation?.scores.overall, revision: state.revisionScores?.overall };

  const leave = async (event: React.MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (leaving) return;
    if (!actions.hasUnsaved()) { router.push("/"); return; }
    setLeaving(true);
    if (await actions.save()) router.push("/"); else setLeaving(false);
  };

  const togglePanel = (side: "left" | "right") => {
    if (ui.wide) (side === "left" ? ui.setLeftOpen : ui.setRightOpen)((open) => !open);
    else ui.setSheet(ui.sheet === side ? null : side);
  };

  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center gap-3 border-b bg-background px-3">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <Link href="/" onClick={leave} className="shrink-0 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          {leaving ? "正在保存…" : "作文"}
        </Link>
        <span className="text-muted-foreground/50" aria-hidden>/</span>
        <Popover>
          <PopoverTrigger className="min-w-0 truncate rounded-md px-2 py-1 text-left font-serif text-[15px] hover:bg-secondary">{state.prompt.text}</PopoverTrigger>
          <PopoverContent align="start" className="w-[520px] max-w-[calc(100vw-2rem)] p-5">
            <p className="prose-prompt not-italic">{state.prompt.text}</p>
            <p className="meta mt-3">Write at least 250 words.</p>
          </PopoverContent>
        </Popover>
        <Badge variant="outline" className="hidden shrink-0 font-normal text-muted-foreground sm:inline-flex">{essayKindLabel(state)}</Badge>
      </div>

      {hasRevision(state) && (
        <ToggleGroup aria-label="版本" size="sm" spacing={0} variant="outline" value={[ui.version]} onValueChange={(value) => { if (value[0]) ui.setVersion(value[0] as EssayKind); }} className="hidden md:flex">
          {(["original", "revision"] as const).map((kind) => (
            <ToggleGroupItem key={kind} value={kind} className="gap-1.5 px-2.5 text-xs">
              {kind === "original" ? "原稿" : "改写稿"}
              {scores[kind] !== undefined && <span className="font-mono text-muted-foreground">{scores[kind]!.toFixed(1)}</span>}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      <div className="flex flex-1 items-center justify-end gap-1.5">
        {editing && (
          <div className="meta mr-2 hidden items-center gap-3 sm:flex">
            <span className={cn(overtime && "text-warn")} title={essayKind === "revision" ? "改写用时" : "考场建议 40 分钟"}>{overtime ? "超过 40 分钟 · " : ""}{formatClock(elapsed)}</span>
            <span>{countWords(state.drafts[essayKind])} 词</span>
            <span className={cn(saveStatus === "error" && "text-destructive")}>{saveStatus === "saving" ? "保存中" : saveStatus === "unsaved" ? "未保存" : saveStatus === "error" ? "保存失败" : "已保存"}</span>
          </div>
        )}
        {hasLeft && <IconButton label="提纲" onClick={() => togglePanel("left")} active={ui.wide ? ui.leftOpen : ui.sheet === "left"}><PanelLeft /></IconButton>}
        {ui.panels.length > 0 && <IconButton label="检查面板" onClick={() => togglePanel("right")} active={ui.wide ? ui.rightOpen : ui.sheet === "right"}><PanelRight /></IconButton>}
        <MoreMenu assessment={assessment} />
        <PrimaryAction onSubmit={onSubmit} assessment={assessment} />
      </div>
    </header>
  );
}

function MoreMenu({ assessment }: { assessment: boolean }) {
  const { state, actions, coachBusy } = useSession();
  const { stage } = state;
  const editing = stage === "writing" || stage === "revising";
  const revisable = stage === "feedback";
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger render={<DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="更多" />} />}><MoreHorizontal /></TooltipTrigger>
        <TooltipContent>更多</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={actions.downloadDraft}><Download />下载作文</DropdownMenuItem>
        {editing && state.mode === "practice" && (
          <DropdownMenuCheckboxItem checked={state.nudgesEnabled} onCheckedChange={(on) => actions.setNudgesEnabled(Boolean(on))}>主动提醒</DropdownMenuCheckboxItem>
        )}
        {revisable && (
          <>
            <DropdownMenuSeparator />
            {assessment
              ? <DropdownMenuItem disabled={coachBusy} onClick={actions.startRevision}><PenLine />改写这篇</DropdownMenuItem>
              : <DropdownMenuItem disabled={coachBusy} onClick={actions.finish}>不改写，完成</DropdownMenuItem>}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function IconButton({ label, onClick, active, children }: { label: string; onClick: () => void; active: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} aria-pressed={active} onClick={onClick} className={cn(!active && "text-muted-foreground")} />}>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function PrimaryAction({ onSubmit, assessment }: { onSubmit: () => void; assessment: boolean }) {
  const { state, actions, coachBusy } = useSession();
  const [confirming, setConfirming] = useState(false);
  const busy = coachBusy;
  switch (state.stage) {
    case "prewriting":
      return <Button size="sm" disabled={busy} onClick={actions.startWriting}>开始写作<ArrowRight /></Button>;
    case "writing":
    case "revising": {
      const revision = state.stage === "revising";
      return (
        <Popover open={confirming} onOpenChange={setConfirming}>
          <PopoverTrigger render={<Button size="sm" disabled={busy} />}>{revision ? "提交改写稿" : "提交评估"}</PopoverTrigger>
          <PopoverContent align="end" className="w-64">
            <p className="text-sm">提交后不能再修改{revision ? "改写稿" : "本稿"}。</p>
            <div className="mt-3 flex justify-end gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>再看看</Button>
              <Button size="sm" onClick={() => { setConfirming(false); onSubmit(); }}>提交</Button>
            </div>
          </PopoverContent>
        </Popover>
      );
    }
    case "evaluating":
    case "re_evaluating":
      return state.evalError
        ? <Button size="sm" disabled={busy} onClick={actions.retryEvaluation}><RotateCcw />重试评估</Button>
        : <Button size="sm" disabled><LoaderCircle className="animate-spin" />评估中</Button>;
    case "feedback":
      return assessment
        ? <Button size="sm" disabled={busy} onClick={actions.finish}>{busy ? <LoaderCircle className="animate-spin" /> : null}完成</Button>
        : <Button size="sm" disabled={busy} onClick={actions.startRevision}>开始改写<ArrowRight /></Button>;
    case "compared":
      return <Button size="sm" disabled={busy} onClick={actions.finish}>{busy ? <LoaderCircle className="animate-spin" /> : null}完成</Button>;
    default:
      return null;
  }
}
