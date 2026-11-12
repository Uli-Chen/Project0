import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/server";
import { readFeatures } from "@/lib/config/features";
import { getDb } from "@/lib/db/client";
import { topicCards } from "@/lib/db/schema";
import { getCard, cardRequirements } from "@/lib/db/queries/cards";
import { getSession, listSessions } from "@/lib/db/queries/sessions";
import { CardReadonly } from "@/components/quick/card-readonly";
import { ReviewDeck } from "@/components/review/review-deck";
import { dueItems, reviewItems, type ReviewItem } from "@/lib/learning/review-items";
import { formatDate } from "@/lib/learning/summary";
import { topicLabels } from "@/lib/question-bank/labels";
import { cn } from "@/lib/utils";

export const metadata = { title: "复习" };
type Tab = "today" | "phrases" | "sentences" | "cards";
const TABS: { key: Tab; label: string }[] = [{ key: "today", label: "今日复习" }, { key: "phrases", label: "表达库" }, { key: "sentences", label: "错句本" }, { key: "cards", label: "观点卡片" }];

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ tab?: string; drafts?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const flags = readFeatures();
  const tabs = TABS.filter(tab => tab.key !== "cards" || flags.QUICK_ENABLED);
  const tab = tabs.find(t => t.key === params.tab)?.key ?? (params.drafts ? "cards" : "today");
  const items = reviewItems(listSessions(user.id));
  const due = dueItems(items, user.profile.review ?? {});
  const counts: Record<Tab, number | null> = { today: due.length, phrases: items.filter(i => i.kind === "phrase").length, sentences: items.filter(i => i.kind === "fix").length, cards: null };

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="page-heading">复习</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">复习的都是你自己写过的东西：采纳过的表达、被指出的句子、整理过的观点。</p>
      </header>
      <nav aria-label="复习内容" className="flex flex-wrap gap-1 border-b">
        {tabs.map(t => (
          <Link key={t.key} href={t.key === "today" ? "/cards" : `/cards?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined} className={cn("-mb-px flex items-baseline gap-1.5 border-b-2 px-3 py-2.5 text-[15px] transition-colors", tab === t.key ? "border-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}{counts[t.key] !== null && <span className="text-[14px] font-normal text-muted-foreground tabular-nums">{counts[t.key]}</span>}
          </Link>
        ))}
      </nav>
      {tab === "today" && <ReviewDeck items={due.slice(0, 12)} />}
      {tab === "phrases" && <ItemList items={items.filter(i => i.kind === "phrase")} empty="在精练里用“英文怎么说”问教练，采纳的说法会收进这里。" />}
      {tab === "sentences" && <ItemList items={items.filter(i => i.kind === "fix")} empty="拿到第一次写作反馈之后，被指出的句子会收进这里。" />}
      {tab === "cards" && <TopicCards userId={user.id} drafts={params.drafts === "true"} />}
    </div>
  );
}

function ItemList({ items, empty }: { items: ReviewItem[]; empty: string }) {
  if (!items.length) return <p className="rounded-2xl border border-dashed border-input px-8 py-14 text-center text-[15px] text-muted-foreground">{empty}</p>;
  return (
    <ul className="surface divide-y overflow-hidden">
      {items.map(item => (
        <li key={item.id} className="grid gap-x-8 gap-y-2 px-6 py-5 md:grid-cols-2">
          <div>
            {item.kind === "fix" && <p className="mb-1.5 text-sm font-medium text-muted-foreground">{item.issueTitle}</p>}
            <p className={cn("leading-relaxed", item.kind === "fix" ? "font-serif text-[17px] text-muted-foreground line-through decoration-foreground/25" : "text-[16px]")}>{item.prompt}</p>
          </div>
          <div>
            {item.kind === "fix" && <p className="mb-1.5 text-sm font-medium text-muted-foreground">{item.answer ? "你的改法" : "改写方向"}</p>}
            <p className={cn("leading-relaxed", item.answer ? "font-serif text-[17px]" : "text-[15px]")}>{item.answer ?? (item.kind === "fix" ? item.hint : "")}</p>
            <Link href={`/essays/${item.sessionId}`} className="mt-2 inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">{formatDate(item.date)} 的作文</Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

function TopicCards({ userId, drafts }: { userId: string; drafts: boolean }) {
  const cards = getDb().select().from(topicCards).where(eq(topicCards.userId, userId)).all().flatMap(row => {
    const card = getCard(userId, row.attemptId), session = getSession(userId, row.attemptId);
    return card && session && (drafts || (card.state === "passed" && card.lastCheckedVersion === card.contentVersion)) ? [{ card, session }] : [];
  });
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-[15px] text-muted-foreground">速刷时整理的观点，按主题收在这里。修改后的卡片需要重新检查。</p>
        <Link className="text-sm underline underline-offset-4" href={drafts ? "/cards?tab=cards" : "/cards?tab=cards&drafts=true"}>{drafts ? "只看已通过" : "包括草稿与待复查"}</Link>
      </div>
      {cards.length === 0 && <p className="rounded-2xl border border-dashed border-input py-14 text-center text-[15px] text-muted-foreground">这里还没有{drafts ? "" : "已通过检查的"}卡片。<Link href="/" className="ml-2 underline">去练习</Link></p>}
      {Object.entries(topicLabels).map(([topic, name]) => {
        const group = cards.filter(c => c.session.question?.primaryTopic === topic);
        return group.length > 0 && (
          <section key={topic} className="space-y-4">
            <h2 className="section-heading">{name}</h2>
            {group.map(({ card, session }) => (
              <article key={card.id} className="surface px-6 py-5">
                <Link href={`/essays/${session.id}`} className="mb-2 block font-serif text-[18px] leading-relaxed hover:underline">{session.question?.text ?? session.prompt.text}</Link>
                <p className="mb-4 text-sm"><span className={card.state === "passed" ? "rounded-full bg-good-soft px-2.5 py-0.5 font-medium text-good" : "rounded-full bg-sunk px-2.5 py-0.5 text-muted-foreground"}>{card.state === "passed" ? "已检查" : "草稿或待复查"}</span></p>
                <CardReadonly content={card.content} requirements={cardRequirements(card)} />
                <Link href={`/topics/${topic}`} className="text-sm underline underline-offset-4">查看原题与练习历史</Link>
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}
