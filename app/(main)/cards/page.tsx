import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { readFeatures } from "@/lib/config/features";
import { listSessions } from "@/lib/db/queries/sessions";
import { ReviewDeck, type DeckCard } from "@/components/review/review-deck";
import { FixDiffList } from "@/components/review/fix-diff";
import { dueAt, mastered, reviewItems, spotStage, todayItems, type ReviewItem, type ReviewState } from "@/lib/learning/review-items";
import { formatDate } from "@/lib/learning/summary";
import { cn } from "@/lib/utils";

export const metadata = { title: "复习" };
type Tab = "today" | "phrases" | "sentences";
const TABS: { key: Tab; label: string }[] = [{ key: "today", label: "今日复习" }, { key: "phrases", label: "表达库" }, { key: "sentences", label: "错句本" }];

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ tab?: string; drafts?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const flags = readFeatures();
  // Idea cards have their own page now; old links to the card tab land there.
  if (params.tab === "cards" && flags.QUICK_ENABLED) redirect(params.drafts ? "/ideas?status=all" : "/ideas");
  const tabs = TABS;
  const tab = tabs.find(t => t.key === params.tab)?.key ?? "today";
  const items = reviewItems(listSessions(user.id));
  const state: ReviewState = user.profile.review ?? {};
  const today = todayItems(items, state);
  const deck: DeckCard[] = today.map(item => ({ item, spot: spotStage(item, state), source: `${formatDate(item.date)} 的作文` }));
  const fixes = items.filter(i => i.kind === "fix");
  const counts: Record<Tab, number> = { today: today.length, phrases: items.filter(i => i.kind === "phrase").length, sentences: fixes.length };

  return (
    <div className="flex flex-col gap-8">
      <h1 className="page-heading">复习</h1>
      <nav aria-label="复习内容" className="flex flex-wrap gap-x-6 border-b">
        {tabs.map(t => (
          <Link key={t.key} href={t.key === "today" ? "/cards" : `/cards?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined} className={cn("-mb-px flex items-baseline gap-1.5 border-b-2 pb-3 text-[16px] transition-colors", tab === t.key ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}{<span className="text-[14px] font-normal text-muted-foreground tabular-nums">{counts[t.key]}</span>}
          </Link>
        ))}
      </nav>
      {tab === "today" && <ReviewDeck cards={deck} />}
      {tab === "phrases" && <ItemList items={items.filter(i => i.kind === "phrase")} state={state} empty="写作文时用“英文怎么说”问教练，采纳的说法会收进这里。" />}
      {tab === "sentences" && (fixes.length
        ? <FixDiffList rows={fixes.map(item => ({ id: item.id, before: item.prompt, after: item.answer, issueTitle: item.issueTitle, progress: progressLabel(item, state), mastered: mastered(state[item.id]), sessionId: item.sessionId, source: `${formatDate(item.date)} 的作文` }))} />
        : <p className="surface px-8 py-14 text-center text-[15px] text-muted-foreground">拿到第一次写作反馈之后，被指出的句子会收进这里。</p>)}
    </div>
  );
}

function ItemList({ items, state, empty }: { items: ReviewItem[]; state: ReviewState; empty: string }) {
  if (!items.length) return <p className="surface px-8 py-14 text-center text-[15px] text-muted-foreground">{empty}</p>;
  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {items.map(item => (
        <li key={item.id} className="surface flex flex-col gap-4 p-5">
          {item.kind === "phrase" ? (
            <div>
              <p className="text-[15px] text-muted-foreground">{item.prompt}</p>
              <p className="mt-1.5 font-serif text-[19px] leading-[1.5]">{item.answer}</p>
            </div>
          ) : item.kind === "fix" ? (
            <div>
              <p className="font-serif text-[16px] leading-[1.55] text-muted-foreground line-through decoration-foreground/25">{item.prompt}</p>
              {item.answer ? <p className="mt-2 font-serif text-[17px] leading-[1.55]">{item.answer}</p> : <p className="mt-2 text-[15px] text-warn">尚未改对</p>}
            </div>
          ) : null}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
            <ul className="flex flex-wrap gap-1.5" aria-label="标签">
              {item.kind === "fix" && <li className="rounded-md bg-sunk px-2 py-0.5 text-[14px] text-muted-foreground">{item.issueTitle}</li>}
              <li className={cn("rounded-md px-2 py-0.5 text-[14px]", mastered(state[item.id]) ? "bg-good-soft text-good" : "bg-sunk text-muted-foreground")}>{progressLabel(item, state)}</li>
            </ul>
            <Link href={`/essays/${item.sessionId}`} className="text-[14px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{formatDate(item.date)} 的作文</Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Where an item stands: mastered, due now, or the date it comes back. */
function progressLabel(item: ReviewItem, state: ReviewState) {
  if (mastered(state[item.id])) return "已掌握";
  const at = dueAt(item, state);
  return at <= Date.now() ? "待复习" : `${formatDate(new Date(at).toISOString())} 复习`;
}
