import Link from "next/link";
import { ChevronDown, FileDiff, Languages } from "lucide-react";
import { requireUser } from "@/lib/auth/server";
import { readFeatures } from "@/lib/config/features";
import { listSessions } from "@/lib/db/queries/sessions";
import { FixDiffList } from "@/components/review/fix-diff";
import { IdeaCards } from "@/components/review/idea-cards";
import { FilterChips } from "@/components/review/filter-chips";
import { TOPIC_ORDER } from "@/components/review/topics";
import { dueAt, mastered, reviewItems, type ReviewItem, type ReviewState } from "@/lib/learning/review-items";
import { formatDate } from "@/lib/learning/summary";
import { topicLabels } from "@/lib/question-bank/labels";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyMedia } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

export const metadata = { title: "复习" };
type Tab = "phrases" | "sentences" | "ideas";
type Params = { tab?: string; topic?: string; status?: string; drafts?: string };
const TABS: { key: Tab; label: string }[] = [{ key: "ideas", label: "观点卡片" }, { key: "phrases", label: "表达库" }, { key: "sentences", label: "错句本" }];
// Items from an own question saved before topics were asked for.
const OTHER = "other";
const BATCH = 12;

export default async function ReviewPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const params = await searchParams;
  const flags = readFeatures();
  const tabs = TABS.filter(t => t.key !== "ideas" || flags.QUICK_ENABLED);
  // "cards" is the idea-card tab's old name.
  const requested = params.tab === "cards" ? "ideas" : params.tab;
  const tab = tabs.find(t => t.key === requested)?.key ?? tabs[0].key;
  const items = reviewItems(listSessions(user.id));
  const state: ReviewState = user.profile.review ?? {};
  const phrases = items.filter(i => i.kind === "phrase"), fixes = items.filter(i => i.kind === "fix");
  const counts: Record<Tab, number | null> = { phrases: phrases.length, sentences: fixes.length, ideas: null };

  // Libraries are filtered by topic; the filter lives in the URL.
  const topic = params.topic === OTHER || (params.topic && topicLabels[params.topic]) ? params.topic : null;
  const allIdeas = params.status === "all" || (params.tab === "cards" && params.drafts === "true");
  const href = (next: { topic?: string | null; status?: string | null }) => {
    const query = new URLSearchParams(Object.entries({ tab, topic, status: tab === "ideas" && allIdeas ? "all" : null, ...next }).filter((entry): entry is [string, string] => !!entry[1]));
    return `/cards?${query}`;
  };
  const inTopic = (item: ReviewItem) => !topic || (topic === OTHER ? item.topic === null : item.topic === topic);
  const topicOptions = (list: ReviewItem[]): [string | null, string][] => [
    [null, `全部 ${list.length}`],
    ...TOPIC_ORDER.flatMap((key): [string, string][] => { const n = list.filter(item => item.topic === key).length; return n ? [[key, `${topicLabels[key]} ${n}`]] : []; }),
    ...(list.some(item => item.topic === null) ? [[OTHER, `其他 ${list.filter(item => item.topic === null).length}`] as [string, string]] : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="page-heading motion-enter">复习</h1>
      <nav aria-label="复习内容" className="motion-enter flex flex-wrap gap-x-6 border-b" style={{ "--i": 1 } as React.CSSProperties}>
        {tabs.map(t => (
          <Link key={t.key} href={t.key === tabs[0].key ? "/cards" : `/cards?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined} className={cn("-mb-px flex items-baseline gap-1.5 border-b-2 pb-2.5 text-[15px] transition-colors", tab === t.key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}{counts[t.key] !== null && <span className="text-[14px] font-normal text-muted-foreground tabular-nums">{counts[t.key]}</span>}
          </Link>
        ))}
      </nav>
      {tab === "phrases" && <div className="motion-enter flex flex-col gap-6" style={{ "--i": 2 } as React.CSSProperties}>
        {phrases.length > 0 && <FilterChips label="话题" options={topicOptions(phrases)} active={topic} href={value => href({ topic: value })} />}
        <ItemList items={phrases.filter(inTopic)} state={state} empty={phrases.length ? "这个话题下还没有表达。" : "写作文时用“英文怎么说”问教练，采纳的说法会收进这里。"} />
      </div>}
      {tab === "sentences" && <div className="motion-enter flex flex-col gap-6" style={{ "--i": 2 } as React.CSSProperties}>
        {fixes.length > 0 && <FilterChips label="话题" options={topicOptions(fixes)} active={topic} href={value => href({ topic: value })} />}
        {fixes.filter(inTopic).length
          ? <Batches total={fixes.filter(inTopic).length} unit="句" render={(from, to) => <FixDiffList rows={fixes.filter(inTopic).slice(from, to).map(item => ({ id: item.id, before: item.prompt, after: item.answer, issueTitle: item.issueTitle, topic: item.topic ? topicLabels[item.topic] : null, topicKey: item.topic, progress: progressLabel(item, state), mastered: mastered(state[item.id]), sessionId: item.sessionId, source: `${formatDate(item.date)} 的作文` }))} />} />
          : <Empty><EmptyMedia variant="icon"><FileDiff /></EmptyMedia><EmptyDescription>{fixes.length ? "这个话题下还没有错句。" : "拿到第一次写作反馈之后，被指出的句子会收进这里。"}</EmptyDescription></Empty>}
      </div>}
      {tab === "ideas" && <div className="motion-enter flex flex-col gap-6" style={{ "--i": 2 } as React.CSSProperties}>
        <div className="flex flex-col gap-2">
          <FilterChips label="话题" options={[[null, "全部"], ...TOPIC_ORDER.map((key): [string, string] => [key, topicLabels[key]])]} active={topic === OTHER ? null : topic} href={value => href({ topic: value })} />
          <FilterChips label="状态" options={[[null, "已通过"], ["all", "全部"]]} active={allIdeas ? "all" : null} href={value => href({ status: value })} />
        </div>
        <IdeaCards userId={user.id} topic={topic === OTHER ? null : topic} all={allIdeas} />
      </div>}
    </div>
  );
}

function ItemList({ items, state, empty }: { items: ReviewItem[]; state: ReviewState; empty: string }) {
  if (!items.length) return <Empty><EmptyMedia variant="icon"><Languages /></EmptyMedia><EmptyDescription>{empty}</EmptyDescription></Empty>;
  return <Batches key={items.map(i => i.id).join("|")} total={items.length} unit="条" render={(from, to) => (
    <ul className="motion-stagger grid gap-3.5 lg:grid-cols-2">
      {items.slice(from, to).map(item => (
        <li key={item.id} className="surface flex flex-col gap-4 p-5 transition-shadow duration-(--dur-standard) ease-(--ease-soft) hover:shadow-lift">
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
              {item.topic && <li className="topic-tag" data-topic={item.topic}>{topicLabels[item.topic]}</li>}
              {item.kind === "fix" && <li className="rounded-md bg-sunk px-2 py-0.5 text-[14px] text-muted-foreground">{item.issueTitle}</li>}
              <li className={cn("rounded-md px-2 py-0.5 text-[14px]", mastered(state[item.id]) ? "bg-good-soft text-good" : "bg-sunk text-muted-foreground")}>{progressLabel(item, state)}</li>
            </ul>
            <Link href={`/essays/${item.sessionId}`} className="text-[14px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{formatDate(item.date)} 的作文</Link>
          </div>
        </li>
      ))}
    </ul>
  )} />;
}

/** A library grows with every essay: the first batch is on the page, the rest one click away. */
function Batches({ total, unit, render }: { total: number; unit: string; render: (from: number, to?: number) => React.ReactNode }) {
  if (total <= BATCH) return render(0);
  return (
    <Collapsible className="flex flex-col gap-3.5">
      {render(0, BATCH)}
      <CollapsibleContent>{render(BATCH)}</CollapsibleContent>
      <CollapsibleTrigger className="group -ml-3 inline-flex h-8 w-fit items-center gap-1.5 rounded-full px-3 text-[14px] text-muted-foreground transition-colors duration-(--dur-fast) hover:bg-sunk hover:text-foreground"><span className="group-data-panel-open:hidden">显示其余 {total - BATCH} {unit}</span><span className="hidden group-data-panel-open:inline">收起</span><ChevronDown className="size-4 transition-transform duration-(--dur-layout) ease-(--ease-soft) group-data-panel-open:rotate-180" aria-hidden /></CollapsibleTrigger>
    </Collapsible>
  );
}

/** Where an item stands: mastered, due now, or the date it comes back. */
function progressLabel(item: ReviewItem, state: ReviewState) {
  if (mastered(state[item.id])) return "已掌握";
  const at = dueAt(item, state);
  return at <= Date.now() ? "待复习" : `${formatDate(new Date(at).toISOString())} 复习`;
}
