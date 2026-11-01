"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { OutlineBoard, outlineProgress } from "@/components/outline/outline-board";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Panel } from "@/lib/learning/essay-view";
import { checkInput } from "@/lib/rules";
import { useSession } from "@/lib/prototype/session-store";
import type { Suggestion } from "@/lib/prototype/types";
import { CoachTab } from "./coach-tab";
import { CompareTab } from "./compare-tab";
import { EssayBody } from "./essay-body";
import { EssayTopbar } from "./essay-topbar";
import { EssayUiProvider, useEssayRefs, useEssayUi } from "./essay-ui";
import { FeedbackTab } from "./feedback-tab";
import { FinishDialog } from "./finish-summary";

const PANEL_LABEL: Record<Panel, string> = { coach: "教练", feedback: "反馈", compare: "对比" };

export function EssayScreen() {
  return <EssayUiProvider><Screen /></EssayUiProvider>;
}

function Screen() {
  const { state, actions, essayKind, error, coachBusy, failedInput } = useSession();
  const ui = useEssayUi();
  const { centerRef, editorRef } = useEssayRefs();
  const [notices, setNotices] = useState<Record<string, string>>({});
  const { stage } = state;
  const practice = state.mode === "practice";
  useTimerAndAutosave();

  // 提纲：练习才有；评估后若从未填写（跳过写前）就不占位置
  const hasLeft = practice && (["prewriting", "writing"].includes(stage) || outlineProgress(state.outline).filled > 0);
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
    if (s.type === "express") {
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

  const outline = (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between px-5">
        <h2 className="text-xs font-medium">提纲</h2>
        {!state.evaluation && <span className="meta">{outlineProgress(state.outline).filled} / {outlineProgress(state.outline).total}</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
        <OutlineBoard
          outline={state.outline}
          density={stage === "prewriting" ? "comfortable" : "compact"}
          onEdit={["prewriting", "writing", "revising"].includes(stage) ? actions.editOutline : undefined}
          coverage={state.evaluation?.review.outlineCoverage}
        />
      </div>
    </div>
  );

  const inspector = ui.panel && (
    <Tabs value={ui.panel} onValueChange={(value) => ui.setPanel(value as Panel)} className="flex h-full min-h-0 flex-col gap-0">
      <div className="flex h-11 shrink-0 items-center border-b px-5">
        <TabsList variant="line" className="h-11 gap-5 p-0">
          {ui.panels.map((panel) => <TabsTrigger key={panel} value={panel} className="flex-none px-0 text-[13px] after:bg-foreground">{PANEL_LABEL[panel]}</TabsTrigger>)}
        </TabsList>
      </div>
      <div className="min-h-0 flex-1">
        {ui.panel === "coach" && <CoachTab onAccept={accept} onUndo={undo} notices={notices} />}
        {ui.panel === "feedback" && <FeedbackTab />}
        {ui.panel === "compare" && <CompareTab />}
      </div>
    </Tabs>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <EssayTopbar onSubmit={submit} hasLeft={hasLeft} />
      {error && !state.evalError && (
        <div role="alert" className="flex shrink-0 flex-wrap items-center gap-3 border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-[13px]">
          <div className="min-w-0 flex-1"><p>{error}</p>{failedInput && <p className="mt-0.5 truncate text-xs text-muted-foreground">未完成的消息：{failedInput}</p>}</div>
          <Button size="xs" variant="outline" onClick={actions.downloadDraft}>下载草稿</Button>
          <Button size="xs" variant="outline" disabled={coachBusy} onClick={() => void actions.retry()}>重试</Button>
          <Button size="icon-xs" variant="ghost" aria-label="关闭" onClick={actions.clearError}><X /></Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {ui.wide && hasLeft && ui.leftOpen && <aside aria-label="提纲" className="w-[264px] shrink-0 border-r bg-background">{outline}</aside>}
        <main ref={centerRef} id="main-content" className="min-w-0 flex-1 overflow-y-auto">
          <EssayBody />
        </main>
        {ui.wide && hasRight && ui.rightOpen && <aside aria-label="检查面板" className="w-[384px] shrink-0 border-l bg-background">{inspector}</aside>}
      </div>

      {!ui.wide && (
        <>
          <Sheet open={ui.sheet === "left" && hasLeft} onOpenChange={(open) => ui.setSheet(open ? "left" : null)}>
            <SheetContent side="left" className="w-[300px] p-0 sm:max-w-[300px]">
              <SheetHeader className="sr-only"><SheetTitle>提纲</SheetTitle><SheetDescription>提纲</SheetDescription></SheetHeader>
              {outline}
            </SheetContent>
          </Sheet>
          <Sheet open={ui.sheet === "right" && hasRight} onOpenChange={(open) => ui.setSheet(open ? "right" : null)}>
            <SheetContent side="right" className="w-[400px] p-0 sm:max-w-[400px]">
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

function useTimerAndAutosave() {
  const { state, actions, essayKind } = useSession();
  const editing = state.stage === "writing" || state.stage === "revising";
  const { tick, markSaved } = actions;
  useEffect(() => {
    if (!editing) return;
    const timer = setInterval(() => tick(essayKind), 1000);
    const saver = setInterval(() => { void markSaved(); }, 15000);
    return () => { clearInterval(timer); clearInterval(saver); };
  }, [editing, essayKind, tick, markSaved]);
}
