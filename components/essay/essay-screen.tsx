"use client";

import type { QuestionRequirements } from "@/lib/question-bank/types";
import Link from "next/link";
import { CheckpointClock, useCheckpointRemaining, type CheckpointTiming } from "@/components/checkpoints/clock";
import { MOCK_DURATION_SECONDS } from "@/lib/rules/checkpoint";
import { MIN_EVALUATION_WORDS } from "@/lib/rules/check-input";
import { CardSnapshotView } from "@/components/quick/card-readonly";
import { DeepLeaveGuard } from "./deep-leave-guard";
import { DeepLifecycleBar } from "./deep-lifecycle-bar";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { OutlineBoard, outlineProgress } from "@/components/outline/outline-board";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Panel } from "@/lib/learning/essay-view";
import { checkInput, countWords } from "@/lib/rules";
import { useSession } from "@/lib/prototype/session-store";
import type { Suggestion } from "@/lib/prototype/types";
import { CoachTab } from "./coach-tab";
import { CompareTab } from "./compare-tab";
import { EssayBody } from "./essay-body";
import { EssayTopbar } from "./essay-topbar";
import { EssayUiProvider, useEssayRefs, useEssayUi } from "./essay-ui";
import { FeedbackTab } from "./feedback-tab";
import { FinishDialog } from "./finish-summary";
import type { Recall } from "@/lib/learning/recall";
import { RecallProvider } from "./recall";
import { cn } from "@/lib/utils";

const PANEL_LABEL: Record<Panel, string> = { coach: "教练", feedback: "反馈", compare: "对比" };

type ScreenProps = { cardRequirements?: QuestionRequirements; timing?: CheckpointTiming };
export function EssayScreen({ recall, ...props }: ScreenProps & { recall?: Recall } = {}) {
  return <RecallProvider value={recall}><EssayUiProvider><Screen {...props} /></EssayUiProvider></RecallProvider>;
}

function Screen({ cardRequirements, timing }: ScreenProps) {
  const { state, actions, essayKind, error, coachBusy, lifecycleBusy, failedInput, leftover, questionBankEnabled, checkpointServerNow } = useSession();
  const ui = useEssayUi();
  const { centerRef, editorRef } = useEssayRefs();
  const [notices, setNotices] = useState<Record<string, string>>({});
  const { stage } = state;
  const practice = state.mode === "practice";
  const [abandoned, setAbandoned] = useState(state.lifecycle === "closed");
  if (!abandoned && state.checkpointId && state.lifecycle === "closed") setAbandoned(true);
  const clock = !abandoned && timing ? { ...timing, serverNow: checkpointServerNow ?? timing.serverNow } : undefined;
  const remaining = useCheckpointRemaining(clock, !state.originalSubmittedAt && state.lifecycle !== "expired");
  const due = state.mode === "mock" && stage === "writing" && !state.originalSubmittedAt &&
    (state.lifecycle === "open" || (Boolean(clock) && state.lifecycle === "set_aside")) &&
    (state.checkpointId ? Boolean(clock) && remaining === 0 : state.elapsed.original >= MOCK_DURATION_SECONDS);
  const attempted = useRef(false);
  const { submitAtDeadline } = actions;
  useEffect(() => {
    if (!due || coachBusy || lifecycleBusy || attempted.current) return;
    attempted.current = true;
    void submitAtDeadline();
  }, [due, coachBusy, lifecycleBusy, submitAtDeadline]);
  useTimerAndAutosave(ui.mockStarted && !due);

  if (due || state.lifecycle === "expired") {
    const expired = state.lifecycle === "expired", words = countWords(state.drafts.original);
    const reason = words < MIN_EVALUATION_WORDS ? `原稿 ${words} 词，未达到 ${MIN_EVALUATION_WORDS} 词的批改门槛。` : "原稿未通过提交检查。";
    return <main id="main-content" className="desk min-h-dvh px-4 py-8 sm:px-8">
      <section className="paper mx-auto max-w-[760px] px-6 py-10 sm:px-12">
        <h1 className="page-heading">{expired ? "模考已过期" : "模考时间到"}</h1>
        <p role="status" className="mt-3 text-muted-foreground">{expired ? `${reason}本次不批改，不计入模考成绩或练习次数。` : "正在交卷，原稿不能再修改。"}</p>
        {!expired && error && <div role="alert" className="mt-4 space-y-2"><p>{error}</p><Button disabled={coachBusy || lifecycleBusy} onClick={() => void actions.retry()}>重试交卷</Button> <Button variant="outline" onClick={actions.downloadDraft}>备份当前内容</Button></div>}
        {expired && <div className="mt-4 flex items-center gap-4">
          <Link className="underline underline-offset-4" href={state.checkpointId ? "/mock" : questionBankEnabled ? "/practice" : "/essays"}>{state.checkpointId ? "返回模考" : "返回练习"}</Link>
          {words > 0 && <Button variant="outline" size="sm" onClick={actions.downloadDraft}>下载原稿</Button>}
        </div>}
        <p className="prose-prompt mt-8 border-t pt-6">{state.prompt.text}</p>
        <p className="prose-essay mt-5 whitespace-pre-wrap break-words">{state.drafts.original || "未作答"}</p>
      </section>
    </main>;
  }

  // 提纲：练习才有；评估后若从未填写（跳过写前）就不占位置
  // 写前：提纲是主角，放在中间的纸上；开始写作后退到左栏当参考
  const centerOutline = practice && stage === "prewriting";
  const hasLeft = practice && !centerOutline && (stage === "writing" || outlineProgress(state.outline).filled > 0);
  const hasRight = ui.panels.length > 0 && ui.panel !== null;

  const submit = () => {
    const reason = checkInput(state.drafts[essayKind], state.prompt.text, essayKind, state.submitted.original ?? undefined);
    if (reason) { toast.warning(reason); return; }
    actions.submit(essayKind);
  };

  const accept = (s: Suggestion) => {
    if (coachBusy) return;
    const draft = state.drafts[essayKind];
    const el = editorRef.current;
    if ((s.type === "express" || s.type === "example")) {
      const at = el?.selectionStart ?? draft.length;
      const before = draft.slice(0, at);
      const after = draft.slice(at);
      const inserted = `${/\w$/.test(before) && /^\w/.test(s.suggestedText) ? " " : ""}${s.suggestedText}${/\w$/.test(s.suggestedText) && /^\w/.test(after) ? " " : ""}`;
      actions.setDraft(essayKind, before + inserted + after);
    } else {
      const currentSelection = el && el.value.slice(el.selectionStart, el.selectionEnd) === s.selectionText ? el.selectionStart : -1;
      const first = draft.indexOf(s.selectionText);
      const ambiguous = first >= 0 && draft.indexOf(s.selectionText, first + 1) >= 0;
      const index = currentSelection >= 0 ? currentSelection : ambiguous ? -1 : first;
      if (index < 0) { setNotices((n) => ({ ...n, [s.id]: "找不到唯一的原文，请在正文中重新选中后再采用。" })); return; }
      actions.setDraft(essayKind, draft.slice(0, index) + s.suggestedText + draft.slice(index + s.selectionText.length));
    }
    actions.decideSuggestion(s.id, "accepted");
  };

  /** 撤销采用：把唯一出现的建议文字换回原文；找不到就提示手动修改 */
  const undo = (s: Suggestion) => {
    if (coachBusy) return;
    const draft = state.drafts[essayKind];
    const first = draft.indexOf(s.suggestedText);
    if (first < 0 || draft.indexOf(s.suggestedText, first + 1) >= 0) { setNotices((n) => ({ ...n, [s.id]: "正文已改动，无法自动撤销，请手动修改。" })); return; }
    actions.setDraft(essayKind, draft.slice(0, first) + s.selectionText + draft.slice(first + s.suggestedText.length));
    actions.decideSuggestion(s.id, "dismissed");
  };

  const progress = outlineProgress(state.outline);
  const outlineCount = !state.evaluation ? <span className="meta tabular-nums">想好了 {progress.filled} / {progress.total}</span>
    : state.evaluation.review.outlineCoverage?.length ? <span className="meta tabular-nums">写进文章 {state.evaluation.review.outlineCoverage.filter((c) => c.status === "written").length} / {state.evaluation.review.outlineCoverage.length}</span> : null;
  const outlineBody = (
    <>
      <OutlineBoard
        questionType={state.prompt.questionType}
        outline={state.outline}
        density={centerOutline ? "comfortable" : "compact"}
        layout={centerOutline ? "grid" : "stack"}
        onEdit={state.lifecycle === "open" && !lifecycleBusy && ["prewriting", "writing", "revising"].includes(stage) ? actions.editOutline : undefined}
        coverage={state.evaluation?.review.outlineCoverage}
      />
      {state.cardSnapshot && ["prewriting", "writing"].includes(stage) && (
        <details className="mt-8 border-t pt-4">
          <summary className="w-fit cursor-pointer text-[15px] text-muted-foreground hover:text-foreground">查看原来的速刷卡片</summary>
          <div className="mt-3"><CardSnapshotView snapshot={state.cardSnapshot} requirements={cardRequirements} /></div>
        </details>
      )}
    </>
  );
  const outline = (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <h2 className="text-[15px] font-semibold">提纲</h2>
        {outlineCount}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-8">{outlineBody}</div>
    </div>
  );
  const centerOutlinePanel = centerOutline ? (
    <section aria-label="提纲" className="mt-9 border-t pt-7">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[19px] font-semibold tracking-tight">提纲</h2>
        {outlineCount}
      </div>
      {outlineBody}
    </section>
  ) : null;

  const errorNotice = error && !state.evalError && (
    <div role="alert" className="flex shrink-0 flex-wrap items-center gap-3 border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-[14px]">
      <div className="min-w-0 flex-1"><p>{error}</p>{failedInput && <p className="mt-0.5 truncate text-sm text-muted-foreground">未完成的消息：{failedInput}</p>}</div>
      <Button size="xs" variant="outline" onClick={actions.downloadDraft}>备份当前内容</Button>
      <Button size="xs" variant="outline" disabled={coachBusy} onClick={() => void actions.retry()}>{state.pendingAction?.retryable === false ? "重新发送" : "重试"}</Button>
      <Button size="icon-xs" variant="ghost" aria-label="关闭" onClick={actions.clearError}><X /></Button>
    </div>
  );

  // Text from the last visit that could not be saved after leaving. Offered, never applied by itself.
  const leftoverNotice = leftover && state.lifecycle === "open" && (
    <div role="status" className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-warn-soft px-4 py-2.5 text-[14px]">
      <p className="min-w-0 flex-1">{leftover.record.at ? `${new Date(leftover.record.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 离开时有内容没能保存上。` : "上次离开时有内容没能保存上。"}{leftover.restorable ? "恢复会用当时的作文和提纲替换现在的内容。" : "这个阶段已经不能再改它，可以下载留存。"}</p>
      {leftover.restorable
        ? <Button size="xs" variant="outline" disabled={lifecycleBusy || coachBusy || !actions.canRestoreLeftover()} onClick={actions.restoreLeftover}>恢复离开前的内容</Button>
        : <Button size="xs" variant="outline" onClick={actions.downloadLeftover}>下载</Button>}
      <Button size="xs" variant="ghost" onClick={actions.discardLeftover}>丢弃</Button>
    </div>
  );

  const inspector = ui.panel && (
    <Tabs value={ui.panel} onValueChange={(value) => ui.setPanel(value as Panel)} className="flex h-full min-h-0 flex-col gap-0">
      <div className="flex h-12 shrink-0 items-center border-b px-4">
        <TabsList variant="line" className="gap-5 p-0 group-data-horizontal/tabs:h-12">
          {ui.panels.map((panel) => <TabsTrigger key={panel} value={panel} className="flex-none px-0 text-sm data-active:font-semibold group-data-horizontal/tabs:after:bottom-[-1px] after:bg-foreground">{PANEL_LABEL[panel]}</TabsTrigger>)}
        </TabsList>
      </div>
      {!ui.wide && errorNotice}
      {ui.panels.map((panel) => (
        <TabsContent key={panel} value={panel} className="min-h-0 flex-1 text-base">
          {panel === "coach" && <CoachTab onAccept={accept} onUndo={undo} notices={notices} />}
          {panel === "feedback" && <FeedbackTab />}
          {panel === "compare" && <CompareTab />}
        </TabsContent>
      ))}
    </Tabs>
  );

  return (
    <div className="desk flex h-dvh flex-col overflow-hidden">
      <EssayTopbar onSubmit={submit} hasLeft={hasLeft} />
      {clock && remaining !== null && <CheckpointClock deadlineAt={clock.deadlineAt} remaining={remaining} sessionId={state.id} originalSubmittedAt={state.originalSubmittedAt} />}
      <DeepLeaveGuard />
      <DeepLifecycleBar lifecycle={state.lifecycle} checkpoint={Boolean(state.checkpointId)} busy={coachBusy || lifecycleBusy} onResume={() => void actions.changeLifecycle("resume")} />
      {leftoverNotice}
      {(ui.wide || ui.sheet !== "right") && errorNotice}
      <div className={cn("flex min-h-0 flex-1", ui.wide && "gap-3 p-3")}>
        {ui.wide && hasLeft && ui.leftOpen && <aside aria-label="提纲" className="surface w-[280px] shrink-0 overflow-hidden">{outline}</aside>}
        <main ref={centerRef} id="main-content" className="min-w-0 flex-1 overflow-y-auto">
          <EssayBody prewrite={centerOutlinePanel} />
        </main>
        {ui.wide && hasRight && ui.rightOpen && <aside aria-label="检查面板" className="surface w-[400px] shrink-0 overflow-hidden">{inspector}</aside>}
      </div>

      {!ui.wide && (
        <>
          <Sheet open={ui.sheet === "left" && hasLeft} onOpenChange={(open) => ui.setSheet(open ? "left" : null)}>
            <SheetContent side="left" className="p-0 data-[side=left]:w-full data-[side=left]:max-w-[300px] data-[side=left]:sm:max-w-[300px]">
              <SheetHeader className="sr-only"><SheetTitle>提纲</SheetTitle><SheetDescription>提纲</SheetDescription></SheetHeader>
              {outline}
            </SheetContent>
          </Sheet>
          <Sheet open={ui.sheet === "right" && hasRight} onOpenChange={(open) => ui.setSheet(open ? "right" : null)}>
            <SheetContent side="right" className="p-0 data-[side=right]:w-full data-[side=right]:max-w-[400px] data-[side=right]:sm:max-w-[400px]">
              <SheetHeader className="sr-only"><SheetTitle>检查面板</SheetTitle><SheetDescription>教练、反馈与对比</SheetDescription></SheetHeader>
              {inspector}
            </SheetContent>
          </Sheet>
        </>
      )}
      <FinishDialog />
    </div>
  );
}

function useTimerAndAutosave(started: boolean) {
  const { state, actions, essayKind } = useSession();
  const editing = started && state.lifecycle === "open" && (state.stage === "writing" || state.stage === "revising");
  const { tick, markSaved } = actions;
  useEffect(() => {
    if (!editing) return;
    const timer = setInterval(() => tick(essayKind), 1000);
    const saver = setInterval(() => { void markSaved(); }, 15000);
    return () => { clearInterval(timer); clearInterval(saver); };
  }, [editing, essayKind, tick, markSaved]);
}
