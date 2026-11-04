"use client";

import type { CoachMessage, Suggestion } from "@/lib/prototype/types";
import { cn } from "@/lib/utils";
import { CoachMarkdown } from "./coach-markdown";
import { SuggestionCard } from "./suggestion-card";

export function CoachMark() {
  return (
    <span className="flex items-center gap-2 text-xs font-semibold text-coach">
      <span className="grid size-6 place-items-center rounded-full bg-coach-soft font-serif text-[15px] font-normal italic leading-none" aria-hidden>0</span>
      教练
    </span>
  );
}

const STAGE_GROUP: Record<CoachMessage["stage"], string> = { quick: "速刷", prewriting: "写前", writing: "写作", issue: "反馈与改写", revision: "反馈与改写" };

export function CoachThread({
  messages,
  suggestions = {},
  busy,
  onAccept,
  onDismiss,
  onUndo,
  notices = {},
  renderTag,
  showStages,
  className,
}: {
  messages: CoachMessage[];
  suggestions?: Record<string, Suggestion>;
  busy?: boolean;
  onAccept?: (s: Suggestion) => void;
  onDismiss?: (s: Suggestion) => void;
  onUndo?: (s: Suggestion) => void;
  notices?: Record<string, string>;
  renderTag?: (m: CoachMessage) => React.ReactNode;
  /** 在对话跨阶段的位置插入分隔标签 */
  showStages?: boolean;
  className?: string;
}) {
  const last = messages.at(-1);

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {messages.map((m, i) => {
        const group = STAGE_GROUP[m.stage];
        const divider = showStages && i > 0 && STAGE_GROUP[messages[i - 1].stage] !== group
          ? <div key={`divider-${m.id}`} className="flex items-center gap-3 text-[11px] text-muted-foreground"><span className="h-px flex-1 bg-border" />{group}<span className="h-px flex-1 bg-border" /></div>
          : null;
        const startsRun = m.role === "coach" && (messages[i - 1]?.role !== "coach" || Boolean(divider));
        if (m.role === "user") {
          return [divider,
            <div key={m.id} className="flex flex-col items-end gap-1.5">
              {renderTag?.(m)}
              {m.quote && (
                <p className="line-clamp-3 max-w-[90%] border-r-2 border-coach-line pr-3 text-right font-serif text-[14.5px] italic leading-relaxed text-muted-foreground">
                  {m.quote}
                </p>
              )}
              <p className="max-w-[88%] rounded-[14px] rounded-br-[4px] border bg-sunk px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
            </div>];
        }
        return [divider,
          <div key={m.id} className="flex min-w-0 flex-col gap-2 text-sm leading-[1.7] animate-in fade-in-0 duration-300">
            {(startsRun || renderTag) && (
              <div className="flex items-center gap-2">
                {startsRun && <CoachMark />}
                {renderTag?.(m)}
              </div>
            )}
            <CoachMarkdown content={m.content} />
            {m.demoSentence && <p className="border-l-2 border-coach-line pl-3 font-serif text-[15.5px] italic">{m.demoSentence}</p>}
            {m.suggestionIds?.map((sid) => {
              const s = suggestions[sid];
              if (!s) return null;
              return (
                <SuggestionCard key={sid} suggestion={s} acceptDisabled={!onAccept} dismissDisabled={!onDismiss} notice={notices[sid]} onAccept={() => onAccept?.(s)} onDismiss={() => onDismiss?.(s)} onUndo={onUndo ? () => onUndo(s) : undefined} />
              );
            })}
          </div>];
      })}
      {busy && (
        <div className="flex flex-col gap-2">
          {last?.role !== "coach" && <CoachMark />}
          <span className="flex gap-1" role="status" aria-label="教练正在思考">
            {[0, 1, 2].map((d) => (
              <span key={d} className="size-1.5 animate-pulse rounded-full bg-coach/60" style={{ animationDelay: `${d * 160}ms` }} />
            ))}
          </span>
        </div>
      )}
    </div>
  );
}
