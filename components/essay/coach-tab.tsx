"use client";

import { openingForDisplay, prewriteOpening } from "@/lib/learning/prewrite-guidance";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CoachEmpty, CoachMark, CoachThread } from "@/components/coach/coach-thread";
import { Composer } from "@/components/coach/composer";
import { Starters } from "@/components/coach/starters";
import { IssueBadge } from "@/components/feedback/issue-list";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { coachCapabilities } from "@/lib/learning/essay-view";
import { useSession } from "@/lib/prototype/session-store";
import type { CoachMessage, Suggestion } from "@/lib/prototype/types";
import { useEssayUi, type Intent } from "./essay-ui";

const INTENT_LABEL: Record<Intent, string> = { ask: "提问", attempt: "试写", express: "英文怎么说" };

export function CoachTab({ onAccept, onUndo, notices }: { onAccept: (s: Suggestion) => void; onUndo: (s: Suggestion) => void; notices: Record<string, string> }) {
  const { state, actions, coachBusy, lifecycleBusy, composerDraft, tutorV2Enabled } = useSession();
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
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <IssueBadge rank={m.issueRank} />
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

  // 示范问题：这个阶段还没开口时，给几句可以直接发出去的话
  const spoke = state.messages.some((m) => m.role === "user" && m.stage === (can.prewrite ? "prewriting" : "writing"));
  const starters = spoke || coachBusy || ui.quote || issue ? []
    : can.prewrite ? (state.outline.stance || state.outline.reasons.some((r) => r.claim)
      ? ["帮我看看提纲哪里还单薄", "帮我给理由想一个例子"]
      : ["我没什么思路，帮我分析一下", "我有个初步立场，帮我看看站不站得住"])
    : stage === "writing" && can.chat ? (state.drafts.original.trim()
      ? ["下一段该写什么？", "帮我看看论证有没有漏洞"]
      : ["不知道怎么开头，给我一点方向", "帮我看看提纲能不能撑起全文"])
    : [];
  const pick = (text: string) => {
    if (unavailable) return;
    if (can.prewrite) actions.sendPrewrite(text); else actions.chat(text);
  };

  const showStartWriting = stage === "prewriting" && Boolean(state.outline.stance);
  const [nudgeOpen, setNudgeOpen] = useState(true);
  const nudge = stage !== "prewriting" && state.nudge && !state.nudge.dismissed && nudgeOpen ? state.nudge : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scroller} onScroll={(event) => { const el = event.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }} className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-6">
        {tutorV2Enabled && state.messages.some(m => m.role === "coach" && m.lang === "en" && m.action !== "opening") && <EnglishNotice />}
        {state.focus && state.mode === "practice" && ["prewriting", "writing", "revising"].includes(stage) && (
          <section className="mb-5 rounded-lg bg-sunk px-3.5 py-3 shadow-[inset_0_0_0_1px_var(--border)]">
            <p className="text-sm font-semibold"><span className="mr-2 font-normal text-muted-foreground">本次重点</span>{state.focus.name}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{state.focus.instruction}</p>
          </section>
        )}
        {nudge && (
          <div className="motion-reveal mb-5 flex items-start gap-3 rounded-lg bg-coach-soft px-3.5 py-3">
            <p className="flex-1 text-[14.5px] leading-relaxed text-foreground">{nudge.message}</p>
            <button type="button" aria-label="关闭提醒" disabled={unavailable} onClick={() => { setNudgeOpen(false); void actions.dismissNudge(); }} className="text-coach/70 hover:text-coach"><X className="size-3.5" /></button>
          </div>
        )}
        {state.messages.length === 0 && !coachBusy ? (
          stage === "prewriting"
            ? <div className="motion-reveal flex flex-col gap-2 text-sm leading-[1.7]"><CoachMark /><p>{prewriteOpening(state.prompt.questionType)}</p></div>
            : !state.focus && !nudge && <CoachEmpty />
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
          <Button variant="outline" size="sm" className="mt-5" disabled={unavailable} onClick={actions.startWriting}>开始写作</Button>
        )}
      </div>

      {(canSend || (can.issue && issues.length > 0)) && (
        <div className="shrink-0 border-t bg-sheet px-3.5 pt-3 pb-3.5">
          {starters.length > 0 && <div className="mb-2.5"><Starters items={starters} disabled={unavailable} onPick={pick} /></div>}
          {canSend && <Composer
            draft={composerDraft}
            onDraftChange={actions.setComposerDraft}
            placeholder={placeholder}
            disabled={unavailable}
            onSend={send}
            focusKey={ui.focusKey}
            top={(ui.quote || issue) ? <>
              {ui.quote && <Chip onRemove={() => ui.setQuote(null)}><span className="line-clamp-1 font-serif italic">{ui.quote}</span></Chip>}
              {issue && !ui.quote && <Chip onRemove={can.chat ? () => ui.setIssueContext(null) : undefined}><IssueBadge rank={issue.rank} /><span className="truncate">{issue.title}</span></Chip>}
            </> : undefined}
            toolbar={<div className="flex items-center gap-1.5">
              {tutorV2Enabled && can.prewrite && <Button size="xs" variant="ghost" disabled={unavailable || (state.tutor?.threads.prewrite?.allowedHelp ?? 0) >= 2 || state.prewriteTurns >= 40} onClick={() => void actions.morePrewrite()}>{(state.tutor?.threads.prewrite?.allowedHelp ?? 0) >= 2 ? "试着先写下你的想法" : "给点提示"}</Button>}
              {intents.length > 1 && (
                <ToggleGroup size="sm" spacing={0} variant="outline" value={[intent]} onValueChange={(value) => { if (value[0]) ui.setIntent(value[0] as Intent); }} aria-label="意图">
                  {intents.map((value) => <ToggleGroupItem key={value} value={value} className="h-7 px-2.5 text-xs">{INTENT_LABEL[value]}</ToggleGroupItem>)}
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
            <div role="group" aria-label="选一个问题和教练讨论" className="motion-stagger flex flex-wrap gap-2">
              {issues.map((item) => <button key={item.rank} type="button" onClick={() => ui.discussIssue(item.rank)} className="motion-press flex max-w-full items-center gap-2 rounded-full border border-input bg-sheet py-1.5 pr-3.5 pl-2 text-left text-sm leading-snug transition-colors duration-(--dur-fast) hover:border-coach-line hover:bg-coach-soft"><IssueBadge rank={item.rank} /><span className="truncate">{item.title}</span></button>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) {
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border bg-sheet px-2 py-1 text-xs">
      {children}
      {onRemove && <button type="button" aria-label="移除" onClick={onRemove} className="shrink-0 text-muted-foreground hover:text-foreground"><X className="size-3" /></button>}
    </span>
  );
}

const englishNoticeSeen = new Set<string>();
function EnglishNotice() {
  const { state } = useSession();
  const checked = useRef(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    let shown = englishNoticeSeen.has(state.id);
    englishNoticeSeen.add(state.id);
    try { shown = shown || localStorage.getItem("tutor-english-notice") === "shown"; if (!shown) localStorage.setItem("tutor-english-notice", "shown"); } catch { /* Once per mounted practice when storage is unavailable. */ }
    setVisible(!shown);
  }, [state.id]);
  return visible ? <p className="mb-4 text-sm text-muted-foreground">教练目前用英文讲解，可以在<a href="/account" className="underline">用户中心</a>改为中文。<button className="ml-2 underline" onClick={() => setVisible(false)}>知道了</button></p> : null;
}
