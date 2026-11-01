"use client";

import { openingForDisplay, prewriteOpening } from "@/lib/learning/prewrite-guidance";
import { ArrowRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CoachThread } from "@/components/coach/coach-thread";
import { Composer } from "@/components/coach/composer";
import { IssueBadge } from "@/components/feedback/issue-list";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { coachCapabilities } from "@/lib/learning/essay-view";
import { useSession } from "@/lib/prototype/session-store";
import type { CoachMessage, Suggestion } from "@/lib/prototype/types";
import { useEssayUi, type Intent } from "./essay-ui";

const INTENT_LABEL: Record<Intent, string> = { ask: "提问", attempt: "试写", express: "英文怎么说" };

export function CoachTab({ onAccept, onUndo, notices }: { onAccept: (s: Suggestion) => void; onUndo: (s: Suggestion) => void; notices: Record<string, string> }) {
  const { state, actions, coachBusy, lifecycleBusy, composerDraft } = useSession();
  const unavailable = coachBusy || lifecycleBusy || state.lifecycle !== "open";
  const ui = useEssayUi();
  const can = coachCapabilities({ ...state, lifecycle: "open" });
  const issues = state.evaluation?.issues ?? [];
  const issue = issues.find((item) => item.rank === ui.issueContext) ?? null;
  const stage = state.stage;

  // 当前上下文下可用的意图
  const intents: Intent[] = can.prewrite ? [] : [
    ...(can.chat || (can.issue && issue) ? ["ask" as const] : []),
    ...(can.issue && issue ? ["attempt" as const] : []),
    ...(can.chat ? ["express" as const] : []),
  ];
  const intent: Intent = intents.includes(ui.intent) ? ui.intent : intents[0] ?? "ask";
  const canSend = can.prewrite || intents.length > 0;

  const send = (text: string) => {
    if (unavailable) return;
    if (can.prewrite) return actions.sendPrewrite(text);
    if (intent === "express") return actions.express(text);
    if (issue && can.issue && !ui.quote) return actions.issueAction(issue.rank, intent === "attempt" ? "attempt" : "ask", text);
    actions.chat(text, ui.quote ?? undefined);
    ui.setQuote(null);
  };

  const placeholder = can.prewrite ? "说说你的想法，中英文都可以"
    : intent === "express" ? "用中文写下想表达的意思"
    : intent === "attempt" ? "试写一句英文"
    : ui.quote ? "关于这段文字，想问什么？"
    : issue ? "关于这个问题，想问什么？"
    : can.issue && !can.chat ? "从反馈里选一个问题讨论" : "问教练";

  const tag = (m: CoachMessage) => m.stage === "issue" && m.issueRank ? (
    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <IssueBadge rank={m.issueRank} className="size-4 text-[10px]" />
      {m.role === "coach" && m.level ? `提示 ${m.level}/3` : null}
    </span>
  ) : null;

  // 只在用户本来就在底部附近时跟随新消息
  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const last = state.messages.at(-1);
  useEffect(() => {
    const el = scroller.current;
    if (el && (nearBottom.current || last?.role === "user")) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [state.messages.length, last?.content, last?.role, coachBusy]);

  const showStartWriting = stage === "prewriting" && Boolean(state.outline.stance);
  const [nudgeOpen, setNudgeOpen] = useState(true);
  const nudge = stage !== "prewriting" && state.nudge && !state.nudge.dismissed && nudgeOpen ? state.nudge : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scroller} onScroll={(event) => { const el = event.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }} className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-6">
        {state.focus && state.mode === "practice" && ["prewriting", "writing", "revising"].includes(stage) && (
          <section className="mb-5 rounded-lg border px-3.5 py-3">
            <p className="text-[11px] text-muted-foreground">本次重点</p>
            <p className="mt-0.5 text-[13px] font-medium">{state.focus.name}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{state.focus.instruction}</p>
          </section>
        )}
        {nudge && (
          <div className="mb-5 flex items-start gap-3 rounded-lg bg-coach-soft px-3.5 py-3 animate-in fade-in-0 slide-in-from-top-1">
            <p className="flex-1 text-[13px] leading-relaxed text-coach">{nudge.message}</p>
            <button type="button" aria-label="关闭提醒" disabled={unavailable} onClick={() => { setNudgeOpen(false); void actions.dismissNudge(); }} className="text-coach/70 hover:text-coach"><X className="size-3.5" /></button>
          </div>
        )}
        {state.messages.length === 0 && !coachBusy ? (
          <p className="text-[13px] text-muted-foreground">{stage === "writing" ? "选中正文，可以让教练理清、润色或检查。" : stage === "feedback" ? "在反馈里点“讨论”，就某个问题和教练聊。" : stage === "prewriting" ? prewriteOpening(state.prompt.questionType) : ""}</p>
        ) : (
          <CoachThread
            messages={state.messages.map(message => openingForDisplay(message, state.prompt.questionType))}
            suggestions={state.suggestions}
            busy={coachBusy}
            notices={notices}
            onAccept={can.chat && !unavailable ? onAccept : undefined}
            onDismiss={!unavailable ? (s) => actions.decideSuggestion(s.id, "dismissed") : undefined}
            onUndo={can.chat && !unavailable ? onUndo : undefined}
            renderTag={tag}
            showStages
          />
        )}
        {showStartWriting && !coachBusy && (
          <Button variant="outline" size="sm" className="mt-5" disabled={unavailable} onClick={actions.startWriting}>开始写作<ArrowRight /></Button>
        )}
      </div>

      {(canSend || (can.issue && issues.length > 0)) && (
        <div className="shrink-0 px-4 pb-4">
          {canSend && <Composer
            draft={composerDraft}
            onDraftChange={actions.setComposerDraft}
            placeholder={placeholder}
            disabled={unavailable}
            onSend={send}
            focusKey={ui.focusKey}
            top={(ui.quote || issue) ? <>
              {ui.quote && <Chip onRemove={() => ui.setQuote(null)}><span className="line-clamp-1 font-serif italic">{ui.quote}</span></Chip>}
              {issue && !ui.quote && <Chip onRemove={can.chat ? () => ui.setIssueContext(null) : undefined}><IssueBadge rank={issue.rank} className="size-4 text-[10px]" /><span className="truncate">{issue.title}</span></Chip>}
            </> : undefined}
            toolbar={<div className="flex items-center gap-1.5">
              {intents.length > 1 && (
                <ToggleGroup size="sm" spacing={0} variant="outline" value={[intent]} onValueChange={(value) => { if (value[0]) ui.setIntent(value[0] as Intent); }} aria-label="意图">
                  {intents.map((value) => <ToggleGroupItem key={value} value={value} className="h-6 px-2 text-xs">{INTENT_LABEL[value]}</ToggleGroupItem>)}
                </ToggleGroup>
              )}
              {issue && !ui.quote && can.issue && (
                <Button size="xs" variant="ghost" className="text-coach" disabled={unavailable} onClick={() => actions.issueAction(issue.rank, "more")}>
                  再给点提示 {state.issueLevels[issue.rank] ?? 1}/3
                </Button>
              )}
            </div>}
          />}
          {!can.chat && can.issue && !issue && (
            <div className="flex flex-wrap gap-1.5">
              {issues.map((item) => <button key={item.rank} type="button" onClick={() => ui.discussIssue(item.rank)} className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"><IssueBadge rank={item.rank} className="size-3.5 text-[9px]" />{item.title}</button>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) {
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs">
      {children}
      {onRemove && <button type="button" aria-label="移除" onClick={onRemove} className="shrink-0 text-muted-foreground hover:text-foreground"><X className="size-3" /></button>}
    </span>
  );
}
