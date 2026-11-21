import Link from "next/link";
import { Layers } from "lucide-react";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { topicCards } from "@/lib/db/schema";
import { getCard, cardRequirements } from "@/lib/db/queries/cards";
import { getSession } from "@/lib/db/queries/sessions";
import { cardSlots } from "@/lib/quick/layouts";
import { questionTypeLabels, topicLabels } from "@/lib/question-bank/labels";
import { sessionTopic } from "@/lib/learning/session-topic";
import { StartPractice } from "@/components/topics/start-practice";
import { TOPIC_ORDER } from "@/components/review/topics";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyMedia } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

// A card's own state, and whether its latest content is the content that passed.
const STATE: Record<string, [string, string]> = {
  passed: ["已通过", "bg-good-soft text-good"],
  needs_development: ["待完善", "bg-warn-soft text-warn"],
  unchecked: ["改过待检查", "bg-sunk text-muted-foreground"],
  draft: ["草稿", "bg-sunk text-muted-foreground"],
};
const POINTS = 3;

/** 观点卡片: the learner's own idea cards, grouped by topic. */
export function IdeaCards({ userId, topic, all }: { userId: string; topic: string | null; all: boolean }) {
  const cards = getDb().select().from(topicCards).where(eq(topicCards.userId, userId)).all().flatMap((row) => {
    const card = getCard(userId, row.attemptId), session = getSession(userId, row.attemptId);
    if (!card || !session) return [];
    const passed = card.state === "passed" && card.lastCheckedVersion === card.contentVersion;
    return all || passed ? [{ card, session, passed }] : [];
  }).sort((a, b) => b.card.updatedAt.localeCompare(a.card.updatedAt));
  const groups = TOPIC_ORDER.filter((key) => !topic || key === topic).map((key) => ({ key, name: topicLabels[key], cards: cards.filter((c) => sessionTopic(c.session) === key) })).filter((group) => group.cards.length);
  return (
    <div>
      {groups.length === 0 ? (
        <Empty><EmptyMedia variant="icon"><Layers /></EmptyMedia><EmptyDescription>还没有{all ? "" : "通过检查的"}观点卡片。</EmptyDescription><EmptyContent><Link href="/practice" className={buttonVariants({ variant: "outline", size: "sm" })}>去练习</Link></EmptyContent></Empty>
      ) : groups.map((group) => (
        <section key={group.key} className="mt-9 first:mt-0">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="section-heading">{group.name}</h2>
            <span className="text-[15px] text-muted-foreground tabular-nums">{group.cards.length} 张</span>
          </div>
          <ul className="motion-stagger mt-3 grid gap-3.5 lg:grid-cols-2">
            {group.cards.map(({ card, session, passed }) => {
              const labels = new Map(cardSlots(cardRequirements(card)).map((slot) => [slot.key, slot.label]));
              const points = card.content.parts.filter((part) => part.text.trim()).slice(0, POINTS);
              const [stateLabel, tone] = passed ? STATE.passed : STATE[card.state === "passed" ? "unchecked" : card.state] ?? STATE.draft;
              const type = session.question?.questionType;
              return (
                <li key={card.id} className="surface flex flex-col gap-4 p-5 transition-shadow duration-(--dur-standard) ease-(--ease-soft) hover:shadow-lift">
                  <Link href={`/essays/${session.id}`} className="line-clamp-2 font-serif text-[17px] leading-[1.55] underline-offset-4 hover:underline">{session.question?.text ?? session.prompt.text}</Link>
                  {points.length > 0 ? (
                    <dl className="flex flex-col gap-2.5">
                      {points.map((part) => (
                        <div key={part.key} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 text-[15px]">
                          <dt className="text-muted-foreground">{labels.get(part.key) ?? ""}</dt>
                          <dd className="line-clamp-2 leading-relaxed">{part.text}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : <p className="text-[15px] text-muted-foreground">还没有内容</p>}
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
                    <ul className="flex flex-wrap gap-1.5" aria-label="标签">
                      {type && <li className="rounded-md bg-sunk px-2 py-0.5 text-[14px] text-muted-foreground">{questionTypeLabels[type] ?? type}</li>}
                      <li className={cn("rounded-md px-2 py-0.5 text-[14px]", tone)}>{stateLabel}</li>
                    </ul>
                    {passed
                      ? <StartPractice size="sm" variant="outline" questionId={card.questionId} activity="deep" continueFromQuickId={session.id}>用卡片写作文</StartPractice>
                      : <Link href={`/essays/${session.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>继续修改</Link>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
