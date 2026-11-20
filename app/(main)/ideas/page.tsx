import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/server";
import { readFeatures } from "@/lib/config/features";
import { getDb } from "@/lib/db/client";
import { topicCards } from "@/lib/db/schema";
import { getCard, cardRequirements } from "@/lib/db/queries/cards";
import { getSession } from "@/lib/db/queries/sessions";
import { cardSlots } from "@/lib/quick/layouts";
import { questionTypeLabels, topicLabels } from "@/lib/question-bank/labels";
import { StartPractice } from "@/components/topics/start-practice";
import { cn } from "@/lib/utils";

export const metadata = { title: "观点" };

// A card's own state, and whether its latest content is the content that passed.
const STATE: Record<string, [string, string]> = {
  passed: ["已通过", "bg-good-soft text-good"],
  needs_development: ["待完善", "bg-warn-soft text-warn"],
  unchecked: ["改过待检查", "bg-sunk text-muted-foreground"],
  draft: ["草稿", "bg-sunk text-muted-foreground"],
};
const POINTS = 3;
// Same order as the question bank.
const TOPICS = ["education", "technology", "environment", "society", "work", "health", "culture"].filter((key) => topicLabels[key]);

/** 观点: the learner's own idea cards, the material they draw on before writing, grouped by topic. */
export default async function IdeasPage({ searchParams }: { searchParams: Promise<{ topic?: string; status?: string }> }) {
  if (!readFeatures().QUICK_ENABLED) notFound();
  const user = await requireUser();
  const params = await searchParams;
  const all = params.status === "all";
  const topic = params.topic && topicLabels[params.topic] ? params.topic : null;
  const cards = getDb().select().from(topicCards).where(eq(topicCards.userId, user.id)).all().flatMap((row) => {
    const card = getCard(user.id, row.attemptId), session = getSession(user.id, row.attemptId);
    if (!card || !session) return [];
    const passed = card.state === "passed" && card.lastCheckedVersion === card.contentVersion;
    return all || passed ? [{ card, session, passed }] : [];
  }).sort((a, b) => b.card.updatedAt.localeCompare(a.card.updatedAt));
  const href = (next: { topic?: string | null; status?: string | null }) => {
    const query = new URLSearchParams(Object.entries({ topic, status: all ? "all" : null, ...next }).filter((entry): entry is [string, string] => !!entry[1]));
    return query.size ? `/ideas?${query}` : "/ideas";
  };
  const groups = TOPICS.filter((key) => !topic || key === topic).map((key) => ({ key, name: topicLabels[key], cards: cards.filter((c) => c.session.question?.primaryTopic === key) })).filter((group) => group.cards.length);

  return (
    <div className="flex flex-col">
      <h1 className="page-heading">观点</h1>
      <div className="mt-8 flex flex-col gap-3">
        <Chips label="话题" options={[[null, "全部"], ...TOPICS.map((key): [string, string] => [key, topicLabels[key]])]} active={topic} href={(value) => href({ topic: value })} />
        <Chips label="状态" options={[[null, "已通过"], ["all", "全部"]]} active={all ? "all" : null} href={(value) => href({ status: value })} />
      </div>

      {groups.length === 0 ? (
        <p className="surface mt-8 px-8 py-14 text-center text-[15px] text-muted-foreground">还没有{all ? "" : "通过检查的"}观点卡片。<Link href="/practice" className="ml-2 text-foreground underline underline-offset-4">去练习</Link></p>
      ) : groups.map((group) => (
        <section key={group.key} className="mt-10">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="section-heading">{group.name}</h2>
            <span className="text-[15px] text-muted-foreground tabular-nums">{group.cards.length} 张</span>
          </div>
          <ul className="mt-4 grid gap-4 lg:grid-cols-2">
            {group.cards.map(({ card, session, passed }) => {
              const labels = new Map(cardSlots(cardRequirements(card)).map((slot) => [slot.key, slot.label]));
              const points = card.content.parts.filter((part) => part.text.trim()).slice(0, POINTS);
              const [stateLabel, tone] = passed ? STATE.passed : STATE[card.state === "passed" ? "unchecked" : card.state] ?? STATE.draft;
              const type = session.question?.questionType;
              return (
                <li key={card.id} className="surface flex flex-col gap-4 p-5">
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
                      : <Link href={`/essays/${session.id}`} className="inline-flex h-8.5 items-center rounded-full border border-input px-3.5 text-sm font-medium transition-colors hover:border-foreground/40 hover:bg-sunk">继续修改</Link>}
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

function Chips({ label, options, active, href }: { label: string; options: [string | null, string][]; active: string | null; href: (value: string | null) => string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1">
      <span className="mr-3 w-8 text-[14px] text-muted-foreground">{label}</span>
      {options.map(([value, name]) => (
        <Link key={name} href={href(value)} aria-current={active === value ? "true" : undefined} className={cn("rounded-full px-3 py-1 text-[14px] transition-colors", active === value ? "bg-foreground text-background" : "text-muted-foreground hover:bg-sunk hover:text-foreground")}>{name}</Link>
      ))}
    </div>
  );
}
