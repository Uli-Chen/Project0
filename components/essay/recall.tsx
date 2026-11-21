"use client";

import { createContext, useContext } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Recall } from "@/lib/learning/recall";

const EMPTY: Recall = { habits: [], cards: [], phrases: [] };
const RecallContext = createContext<Recall>(EMPTY);

export function RecallProvider({ value, children }: { value?: Recall; children: React.ReactNode }) {
  return <RecallContext.Provider value={value ?? EMPTY}>{children}</RecallContext.Provider>;
}

export const useRecall = () => useContext(RecallContext);

/** Before a practice essay is submitted: the learner's own recurring problems, to check for themselves. */
export function SubmitSelfCheck() {
  const { habits } = useRecall();
  if (!habits.length) return null;
  return (
    <div className="mb-3 rounded-md bg-coach-soft px-2.5 py-2">
      <p className="text-[14px] font-medium">提交前自己查一遍</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {habits.map((habit) => <li key={habit.title} className="flex items-baseline justify-between gap-3 text-[14px]"><span>{habit.title}</span><span className="shrink-0 text-muted-foreground tabular-nums">{habit.essays} 篇里出现 {habit.seen} 次</span></li>)}
      </ul>
    </div>
  );
}

/** While planning and writing: the learner's own passed cards on this topic and the expressions they adopted. */
export function RecallPanel() {
  const { cards, phrases } = useRecall();
  const count = cards.length + phrases.length;
  if (!count) return null;
  return (
    <Collapsible className="mb-5 rounded-lg bg-sunk shadow-[inset_0_0_0_1px_var(--border)]">
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm">
        <span><span className="font-semibold">我的积累</span><span className="ml-2 text-muted-foreground tabular-nums">{[cards.length ? `${cards.length} 张同话题卡片` : "", phrases.length ? `${phrases.length} 个表达` : ""].filter(Boolean).join("，")}</span></span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform duration-(--dur-layout) ease-(--ease-soft) group-data-panel-open:rotate-180" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-4 px-3.5 pb-3.5">
          {cards.map((card) => (
            <section key={card.id}>
              <p className="line-clamp-2 font-serif text-[15px] leading-snug text-muted-foreground">{card.question}</p>
              <dl className="mt-1.5 flex flex-col gap-1">
                {card.points.map((point, i) => <div key={i} className="grid grid-cols-[4rem_minmax(0,1fr)] gap-2 text-[14px] leading-relaxed"><dt className="text-muted-foreground">{point.label}</dt><dd>{point.text}</dd></div>)}
              </dl>
            </section>
          ))}
          {phrases.length > 0 && (
            <ul className="flex flex-col gap-2">
              {phrases.map((phrase) => <li key={phrase.id}><p className="text-[14px] text-muted-foreground">{phrase.prompt}</p><p className="font-serif text-[16px] leading-snug">{phrase.answer}</p></li>)}
            </ul>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
