import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/server";
import { readFeatures } from "@/lib/config/features";
import { getDb } from "@/lib/db/client";
import { topicCards } from "@/lib/db/schema";
import { getCard, cardRequirements } from "@/lib/db/queries/cards";
import { getSession } from "@/lib/db/queries/sessions";
import { CardReadonly } from "@/components/quick/card-readonly";

const names: Record<string, string> = { education: "教育", technology: "科技", environment: "环境", society: "社会", work: "工作", health: "健康", culture: "文化" };
export default async function CardsPage({ searchParams }: { searchParams: Promise<{ drafts?: string }> }) {
  const user = await requireUser();
  const drafts = (await searchParams).drafts === "true";
  if (!readFeatures().QUESTION_BANK_ENABLED) return <><h1 className="page-heading">卡片</h1><p className="mt-4 text-muted-foreground">主题卡片暂未开放。</p></>;
  const cards = getDb().select().from(topicCards).where(eq(topicCards.userId, user.id)).all().flatMap(row => {
    const card = getCard(user.id, row.attemptId), session = getSession(user.id, row.attemptId);
    return card && session && (drafts || (card.state === "passed" && card.lastCheckedVersion === card.contentVersion)) ? [{ card, session }] : [];
  });
  return <div className="space-y-8"><div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="page-heading">卡片</h1><p className="mt-2 text-sm text-muted-foreground">复习你自己的原话。修改后的卡片需要重新检查，历史完成记录保持不变。</p></div><Link className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground" href={drafts ? "/cards" : "/cards?drafts=true"}>{drafts ? "只看已通过" : "包括草稿与待复查"}</Link></div>{cards.length === 0 && <p className="rounded-xl border border-dashed border-input bg-sunk py-14 text-center text-muted-foreground">这里还没有{drafts ? "" : "已通过检查的"}卡片。<Link href="/" className="ml-2 underline">去练习</Link></p>}{Object.entries(names).map(([topic, name]) => {
    const group = cards.filter(c => c.session.question?.primaryTopic === topic);
    return group.length > 0 && <section key={topic} className="space-y-4"><h2 className="section-heading">{name}</h2>{group.map(({ card, session }) => <article key={card.id} className="surface px-6 py-5"><Link href={`/essays/${session.id}`} className="mb-2 block font-serif text-[18px] leading-relaxed hover:underline">{session.question?.text ?? session.prompt.text}</Link><p className="mb-4 flex items-center gap-2 text-xs text-muted-foreground"><span className={card.state === "passed" ? "rounded-full bg-good-soft px-2 py-0.5 font-medium text-good" : "rounded-full bg-sunk px-2 py-0.5"}>{card.state === "passed" ? "已检查" : "草稿或待复查"}</span>版本 {card.contentVersion}</p><CardReadonly content={card.content} requirements={cardRequirements(card)} /><Link href={`/topics/${topic}`} className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">查看原题与练习历史</Link></article>)}</section>;
  })}</div>;
}
