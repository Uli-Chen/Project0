"use client";

import { Check, ChevronLeft, Download, LoaderCircle, MoreHorizontal, PanelLeft, PanelRight, PenLine, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { hasRevision } from "@/lib/learning/essay-view";
import { essayKindLabel } from "@/lib/learning/summary";
import { countWords } from "@/lib/rules";
import { MOCK_DURATION_SECONDS } from "@/lib/rules/checkpoint";
import { useSession } from "@/lib/prototype/session-store";
import type { EssayKind } from "@/lib/prototype/types";
import { SubmitSelfCheck } from "./recall";
import { cn } from "@/lib/utils";
import { useEssayUi } from "./essay-ui";

/** IELTS Task 2 asks for at least this many words. */
export const MIN_WORDS = 250;

export function formatClock(sec: number) {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

export function EssayTopbar({ onSubmit, hasLeft }: { onSubmit: () => void; hasLeft: boolean }) {
  const { state, actions, essayKind, saveStatus } = useSession();
  const ui = useEssayUi();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [mockLeave, setMockLeave] = useState(false);
  const { stage } = state;
  const editing = stage === "writing" || stage === "revising";
  const elapsed = state.elapsed[essayKind];
  const overtime = essayKind === "original" && elapsed > MOCK_DURATION_SECONDS;
  // 模考按 40 分钟倒数；练习只显示已用时间
  const countdown = state.mode === "mock" && essayKind === "original" && !state.checkpointId;
  const words = countWords(state.drafts[essayKind]);
  const short = words > 0 && words < MIN_WORDS;
  const assessment = state.kind === "assessment";
  const scores: Record<EssayKind, number | undefined> = { original: state.evaluation?.scores.overall, revision: state.revisionScores?.overall };

  const leave = async (event: React.MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (leaving) return;
    if (state.mode === "mock" && stage === "writing" && state.lifecycle === "open" && state.elapsed.original > 0 && !mockLeave) { setMockLeave(true); return; }
    await saveAndLeave();
  };
  const saveAndLeave = async () => {
    if (!actions.hasUnsaved()) { router.push("/essays"); return; }
    setLeaving(true);
    if (await actions.save()) router.push("/essays"); else setLeaving(false);
  };

  const togglePanel = (side: "left" | "right") => {
    if (ui.wide) (side === "left" ? ui.setLeftOpen : ui.setRightOpen)((open) => !open);
    else ui.setSheet(ui.sheet === side ? null : side);
  };

  const revisionToggle = hasRevision(state) ? (
    <ToggleGroup aria-label="版本" size="sm" spacing={0} variant="outline" value={[ui.version]} onValueChange={(value) => { if (value[0]) ui.setVersion(value[0] as EssayKind); }}>
      {(["original", "revision"] as const).map((kind) => (
        <ToggleGroupItem key={kind} value={kind} className="gap-1.5 px-2.5 text-sm">
          {kind === "original" ? "原稿" : "改写稿"}
          {scores[kind] !== undefined && <span className="text-muted-foreground tabular-nums">{scores[kind]!.toFixed(1)}</span>}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  ) : null;
  const status = editing ? <WritingStatus hideTime={Boolean(state.checkpointId) && essayKind === "original"} countdown={countdown} overtime={overtime} elapsed={elapsed} essayKind={essayKind} words={words} short={short} saveStatus={saveStatus} /> : null;

  return (
    <>
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-sheet px-3">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <Link href="/essays" onClick={leave} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          {!leaving && <ChevronLeft className="size-4" />}{leaving ? "正在保存…" : "练习"}
        </Link>
        <span className="text-input" aria-hidden>/</span>
        <Popover>
          <PopoverTrigger className="min-w-0 truncate rounded-md px-2 py-1 text-left font-serif text-[16px] hover:bg-secondary">{state.prompt.text}</PopoverTrigger>
          <PopoverContent align="start" className="w-[520px] max-w-[calc(100vw-2rem)] p-5">
            <p className="prose-prompt not-italic">{state.prompt.text}</p>
            <p className="meta mt-3">Write at least 250 words.</p>
          </PopoverContent>
        </Popover>
        <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">{essayKindLabel(state)}</Badge>
      </div>

      {revisionToggle && <div className="hidden md:flex">{revisionToggle}</div>}

      <div className="flex flex-1 items-center justify-end gap-1.5">
        {status && <div className="meta mr-2 hidden items-center gap-3.5 sm:flex">{status}</div>}
        {hasLeft && <IconButton label="提纲" onClick={() => togglePanel("left")} active={ui.wide ? ui.leftOpen : ui.sheet === "left"}><PanelLeft /></IconButton>}
        {ui.panels.length > 0 && <IconButton label="检查面板" onClick={() => togglePanel("right")} active={ui.wide ? ui.rightOpen : ui.sheet === "right"}><PanelRight /></IconButton>}
        <MoreMenu assessment={assessment} />
        <PrimaryAction onSubmit={onSubmit} assessment={assessment} />
      </div>
      <Dialog open={mockLeave} onOpenChange={setMockLeave}>
        <DialogContent>
          <DialogHeader><DialogTitle>模考还没写完</DialogTitle><DialogDescription>{state.checkpointId ? "独立模考的 40 分钟不会暂停，离开期间时间照常走。" : "离开后计时会暂停，回来可以接着写，但这样就不是一次连续 40 分钟的模考了。"}草稿会先保存。</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" disabled={leaving} onClick={() => setMockLeave(false)}>继续写</Button><Button disabled={leaving} onClick={() => void saveAndLeave()}>{leaving ? "正在保存…" : "保存并离开"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
    {/* 窄屏：版本切换和写作状态放到顶栏下的一行，不靠隐藏来省位置 */}
    {(revisionToggle || status) && (
      <div className={cn("flex shrink-0 items-center gap-3 border-b bg-sheet px-3 py-1.5", revisionToggle ? "md:hidden" : "sm:hidden")}>
        {revisionToggle}
        {status && <div className="meta ml-auto flex items-center gap-3 sm:hidden">{status}</div>}
      </div>
    )}
    </>
  );
}

/** 用时或倒计时、字数、保存状态；顶栏和窄屏状态行共用 */
function WritingStatus({ hideTime, countdown, overtime, elapsed, essayKind, words, short, saveStatus }: {
  hideTime: boolean; countdown: boolean; overtime: boolean; elapsed: number; essayKind: EssayKind; words: number; short: boolean; saveStatus: "saved" | "saving" | "unsaved" | "error";
}) {
  return (
    <>
      {hideTime ? null : countdown
        ? <span className={cn("tabular-nums", elapsed > 2100 && "text-warn")} title="模考限时 40 分钟">剩余 {formatClock(Math.max(0, MOCK_DURATION_SECONDS - elapsed))}</span>
        : <span className={cn("tabular-nums", overtime && "text-warn")} title={essayKind === "revision" ? "改写用时" : "考场建议 40 分钟"}>{overtime ? "超过 40 分钟，" : ""}{formatClock(elapsed)}</span>}
      <span className={cn("tabular-nums", short && "text-warn")} title={`题目要求至少 ${MIN_WORDS} 词`}>{words}{short ? ` / ${MIN_WORDS}` : ""} 词</span>
      <span role={saveStatus === "error" ? "alert" : undefined} className={cn("inline-flex items-center gap-1", saveStatus === "error" ? "font-medium text-destructive" : saveStatus === "saved" && "text-good")}>{saveStatus === "saved" && <Check className="size-3.5" />}{saveStatus === "saving" ? "保存中" : saveStatus === "unsaved" ? "未保存" : saveStatus === "error" ? "保存失败" : "已保存"}</span>
    </>
  );
}

function MoreMenu({ assessment }: { assessment: boolean }) {
  const { state, actions, coachBusy, lifecycleBusy, error } = useSession();
  const [closing, setClosing] = useState(false);
  const unavailable = coachBusy || lifecycleBusy;
  const { stage } = state;
  const editing = stage === "writing" || stage === "revising";
  const revisable = state.lifecycle === "open" && stage === "feedback";
  return (
    <>
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger render={<DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="更多" />} />}><MoreHorizontal /></TooltipTrigger>
        <TooltipContent>更多</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={actions.downloadDraft}><Download />下载作文</DropdownMenuItem>
        {state.lifecycle === "open" && editing && state.mode === "practice" && (
          <DropdownMenuCheckboxItem disabled={unavailable} checked={state.nudgesEnabled} onCheckedChange={(on) => actions.setNudgesEnabled(Boolean(on))}>主动提醒</DropdownMenuCheckboxItem>
        )}
        <DropdownMenuSeparator />
        {state.lifecycle === "open"
          ? <DropdownMenuItem disabled={unavailable} onClick={() => void actions.changeLifecycle("setAside")}>保存并暂放</DropdownMenuItem>
          : <DropdownMenuItem disabled={unavailable} onClick={() => void actions.changeLifecycle("resume")}>恢复练习</DropdownMenuItem>}
        {state.lifecycle !== "closed" && <DropdownMenuItem disabled={unavailable} onClick={() => setClosing(true)}>关闭这次练习</DropdownMenuItem>}
        {revisable && (
          <>
            <DropdownMenuSeparator />
            {assessment
              ? <DropdownMenuItem disabled={unavailable} onClick={() => void actions.startRevision()}><PenLine />改写这篇</DropdownMenuItem>
              : <DropdownMenuItem disabled={unavailable} onClick={actions.finish}>不改写，完成</DropdownMenuItem>}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={closing} onOpenChange={setClosing}>
      <DialogContent><DialogHeader><DialogTitle>关闭这次练习？</DialogTitle><DialogDescription>会先保存作文和提纲；教练输入框里没发送的文字不会保存。关闭后首页不再提示继续，正文和反馈都会保留，之后仍可恢复。{state.checkpointId ? "这次独立模考会就此结束，成绩不会加入趋势；之后恢复也不会重新计时。" : "如果只是稍后继续，可以取消并选择暂放。"}</DialogDescription></DialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button variant="outline" disabled={lifecycleBusy} onClick={() => setClosing(false)}>取消</Button><Button disabled={unavailable} onClick={async () => { if (await actions.changeLifecycle("close")) setClosing(false); }}>{lifecycleBusy ? "正在保存…" : "保存并关闭"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    </>
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
  const { state, actions, coachBusy, lifecycleBusy } = useSession();
  const [confirming, setConfirming] = useState(false);
  const busy = coachBusy || lifecycleBusy;
  if (state.lifecycle !== "open") return null;
  switch (state.stage) {
    case "prewriting":
      return <Button size="sm" disabled={busy} onClick={actions.startWriting}>开始写作</Button>;
    case "writing":
    case "revising": {
      const revision = state.stage === "revising";
      const words = countWords(state.drafts[revision ? "revision" : "original"]);
      return (
        <Popover open={confirming} onOpenChange={setConfirming}>
          <PopoverTrigger render={<Button size="sm" disabled={busy} />}>{revision ? "提交改写稿" : "提交评估"}</PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            {words < MIN_WORDS && <p className="mb-2 rounded-md bg-warn-soft px-2.5 py-2 text-sm">现在 {words} 词，题目要求至少 {MIN_WORDS} 词。考试中字数不足会影响任务回应的得分。</p>}
            {state.mode === "practice" && <SubmitSelfCheck />}
            <p className="text-sm">提交后不能再修改{revision ? "改写稿" : "本稿"}。</p>
            <div className="mt-3 flex justify-end gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>再看看</Button>
              <Button size="sm" onClick={() => { setConfirming(false); onSubmit(); }}>{words < MIN_WORDS ? "仍然提交" : "提交"}</Button>
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
        : <Button size="sm" disabled={busy} onClick={() => void actions.startRevision()}>开始改写</Button>;
    case "compared":
      return <Button size="sm" disabled={busy} onClick={actions.finish}>{busy ? <LoaderCircle className="animate-spin" /> : null}完成</Button>;
    default:
      return null;
  }
}
