import Link from "next/link";
import { ChevronDown, PenLine } from "lucide-react";
import { notFound } from "next/navigation";
import { readFeatures } from "@/lib/config/features";
import { requireUser } from "@/lib/auth/server";
import { getTopicData } from "@/lib/db/queries/topics";
import { listSessions } from "@/lib/db/queries/sessions";
import { getCard } from "@/lib/db/queries/cards";
import { questionTypeLabels, topicLabels } from "@/lib/question-bank/labels";
import { essayKindLabel, formatDate, sessionDate } from "@/lib/learning/summary";
import { libraryEntryState } from "@/lib/learning/library";
import { pickQuestion, type QuestionPick } from "@/lib/rules/pick-question";
import { pageWindow } from "@/lib/rules/page-window";
import { PracticeRecords, type PracticeRecord } from "@/components/practice/practice-records";
import { QuestionBank, type BankQuestion } from "@/components/practice/question-bank";
import { BankFilters, BankSearch, type FilterGroup } from "@/components/practice/bank-filters";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyMedia } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

export const metadata = { title: "练习" };

type Params = { tab?: string; type?: string; topic?: string; done?: string; page?: string; q?: string };
// Questions per page: five rows of two.
const PAGE_SIZE = 10;
// Practised or not: unpractised questions by default.
const DONE: [string | null, string][] = [[null, "没练过"], ["yes", "练过"], ["all", "全部"]];

/** 练习: the question bank filtered by question type and topic, and every practice so far. */
export default async function PracticePage({ searchParams }: { searchParams: Promise<Params> }) {
  const features = readFeatures();
  if (!features.QUESTION_BANK_ENABLED) notFound();
  const user = await requireUser();
  const params = await searchParams;
  const data = getTopicData(user.id);
  const sessions = listSessions(user.id);
  const records = practiceRecords(user.id, sessions, data, features.QUICK_ENABLED);
  const tab = params.tab === "records" ? "records" : "bank";
  const practice = data.questions.filter((q) => q.pool === "practice");
  const all = practice.map((q) => bankQuestion(q, data, sessions));
  const practised = all.filter((q) => q.status !== "new").length;
  const heading = (
    <header className="motion-enter flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <h1 className="page-heading">练习</h1>
      {all.length > 0 && (
        <p className="pb-1 text-[14px] text-muted-foreground tabular-nums">练过 <b className="font-semibold text-primary">{practised}</b> / {all.length} 道</p>
      )}
    </header>
  );
  const tabs = (
    <nav aria-label="练习" className="flex gap-6">
      <TabLink href="/practice" active={tab === "bank"}>题库</TabLink>
      <TabLink href="/practice?tab=records" active={tab === "records"}>我的练习 <span className="tabular-nums text-muted-foreground">{records.length}</span></TabLink>
    </nav>
  );

  if (tab === "records") return (
    <div className="flex flex-col">
      {heading}
      <div className="motion-enter mt-6 border-b" style={{ "--i": 1 } as React.CSSProperties}>{tabs}</div>
      <div className="motion-enter" style={{ "--i": 2 } as React.CSSProperties}>
        {records.length ? <PracticeRecords rows={records} /> : <Empty className="mt-6"><EmptyMedia variant="icon"><PenLine /></EmptyMedia><EmptyDescription>还没有练习</EmptyDescription></Empty>}
      </div>
    </div>
  );

  const type = params.type && questionTypeLabels[params.type] ? params.type : null;
  const topic = params.topic && data.topics.some((t) => t.topic === params.topic) ? params.topic : null;
  const done = params.done === "yes" || params.done === "all" ? params.done : null;
  // A search looks through every question, practised or not: someone hunting for a question they saw elsewhere should find it.
  const search = (params.q ?? "").trim().slice(0, 80);
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = all.filter((q, i) => (!type || practice[i].questionType === type) && (!topic || practice[i].primaryTopic === topic)
    && (words.length ? words.every((word) => q.text.toLowerCase().includes(word)) : done === "all" || (done === "yes") === (q.status !== "new")));
  // Where practice has and has not reached: every topic against every question type.
  const types = Object.keys(questionTypeLabels);
  const coverage = data.topics.map((t) => ({ topic: t.topic, cells: types.map((kind) => {
    const cell = all.filter((_, i) => practice[i].primaryTopic === t.topic && practice[i].questionType === kind);
    return { kind, total: cell.length, done: cell.filter((q) => q.status !== "new").length };
  }) }));
  const reached = coverage.flatMap((row) => row.cells).filter((cell) => cell.done > 0).length, cells = coverage.flatMap((row) => row.cells).filter((cell) => cell.total > 0).length;
  const picked = pickQuestion(data.questions, data.completions, data.attempts);
  const pickedQuestion = picked && all.find((q) => q.id === picked.questionId);
  const pick = picked && pickedQuestion ? { question: pickedQuestion, reason: pickReason(picked, data.questions.find((q) => q.id === picked.questionId)!) } : null;
  // Changing a filter starts again from page one; only the pager carries a page number.
  const href = (next: { type?: string | null; topic?: string | null; done?: string | null; page?: string | null }) => {
    const query = new URLSearchParams(Object.entries({ type, topic, done, q: search || null, page: null, ...next }).filter((entry): entry is [string, string] => !!entry[1]));
    return query.size ? `/practice?${query}` : "/practice";
  };
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const visible = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const group = (label: string, key: "type" | "topic" | "done", options: [string | null, string][], active: string | null): FilterGroup => ({ label, options: options.map(([value, name]) => ({ label: name, href: href({ [key]: value }), active: active === value })) });
  const groups = [
    group("题型", "type", [[null, "全部"], ...Object.entries(questionTypeLabels)], type),
    group("话题", "topic", [[null, "全部"], ...data.topics.map((t): [string, string] => [t.topic, topicLabels[t.topic] ?? t.topic])], topic),
    group("状态", "done", DONE, done),
  ];

  return (
    <div className="flex flex-col">
      {heading}
      <div className="motion-enter mt-6 border-b" style={{ "--i": 1 } as React.CSSProperties}>{tabs}</div>
      <QuestionBank filters={<><BankSearch value={search} /><BankFilters groups={groups} /></>} coverage={cells > 0 && (
        <Collapsible className="mt-3">
          <CollapsibleTrigger className="group -ml-3 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[14px] text-muted-foreground transition-colors duration-(--dur-fast) hover:bg-sunk hover:text-foreground">练习覆盖<span className="text-foreground tabular-nums">{reached} / {cells}</span><ChevronDown className="size-4 transition-transform duration-(--dur-layout) ease-(--ease-soft) group-data-panel-open:rotate-180" aria-hidden /></CollapsibleTrigger>
          <CollapsibleContent>
            <div className="max-w-full overflow-x-auto pt-2 pb-1">
              <table className="border-separate border-spacing-1 text-[13px] tabular-nums">
                <caption className="sr-only">每个话题和题型练过几道、共几道</caption>
                <thead><tr><td />{types.map((kind) => <th key={kind} scope="col" className="px-1 pb-1 font-normal whitespace-nowrap text-muted-foreground">{questionTypeLabels[kind]}</th>)}</tr></thead>
                <tbody>
                  {coverage.map((row) => (
                    <tr key={row.topic}>
                      <th scope="row" className="pr-2 text-left font-normal"><span className="topic-tag" data-topic={row.topic}>{topicLabels[row.topic] ?? row.topic}</span></th>
                      {row.cells.map((cell) => (
                        <td key={cell.kind} className="p-0">
                          {cell.total === 0 ? <span className="flex h-8 min-w-[4.5rem] items-center justify-center text-faint">—</span> : (
                            <Link href={`/practice?topic=${row.topic}&type=${cell.kind}&done=all`} scroll={false} title={`${topicLabels[row.topic] ?? row.topic}，${questionTypeLabels[cell.kind]}：练过 ${cell.done} 道，共 ${cell.total} 道`}
                              className={cn("flex h-8 min-w-[4.5rem] items-center justify-center rounded-md transition-shadow duration-(--dur-fast) hover:shadow-[0_0_0_1px_var(--primary)]", cell.done === 0 ? "bg-sunk text-faint" : cell.done / cell.total < 0.5 ? "bg-primary/15 text-foreground" : "bg-primary/35 text-foreground")}>
                              {cell.done} / {cell.total}
                            </Link>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )} questions={shown} visible={visible} pager={pages > 1 ? <Pager page={page} pages={pages} total={shown.length} href={(n) => href({ page: n > 1 ? String(n) : null })} /> : null} pick={pick} quickEnabled={features.QUICK_ENABLED} />
    </div>
  );
}

/** 上一页 / page numbers / 下一页, with where this page sits in the list. */
function Pager({ page, pages, total, href }: { page: number; pages: number; total: number; href: (page: number) => string }) {
  const step = "inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2.5 text-[14px] tabular-nums transition-colors duration-(--dur-fast) ease-(--ease-soft)";
  const idle = cn(step, "text-muted-foreground hover:bg-sunk hover:text-foreground");
  return (
    <nav aria-label="分页" className="mt-7 flex flex-wrap items-center justify-between gap-4">
      <p className="text-[14px] text-muted-foreground tabular-nums">第 {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} 道，共 {total} 道</p>
      <div className="flex items-center gap-1">
        {page > 1 ? <Link href={href(page - 1)} className={idle}>上一页</Link> : <span className={cn(step, "text-faint")}>上一页</span>}
        {pageWindow(page, pages).map((n, i) => n === null
          ? <span key={`gap${i}`} className={cn(step, "min-w-6 px-0 text-faint")} aria-hidden>…</span>
          : n === page
          ? <span key={n} aria-current="page" className={cn(step, "bg-coach-soft font-medium text-primary")}>{n}</span>
          : <Link key={n} href={href(n)} className={idle}>{n}</Link>)}
        {page < pages ? <Link href={href(page + 1)} className={idle}>下一页</Link> : <span className={cn(step, "text-faint")}>下一页</span>}
      </div>
    </nav>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return <Link href={href} aria-current={active ? "page" : undefined} className={cn("-mb-px border-b-2 pb-2.5 text-[15px] transition-colors", active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{children}</Link>;
}

type Data = ReturnType<typeof getTopicData>;
type Question = Data["questions"][number];
type Sessions = ReturnType<typeof listSessions>;

function bankQuestion(q: Question, data: Data, sessions: Sessions): BankQuestion {
  const attempts = data.attempts.filter((a) => a.exposureKey === q.exposureKey);
  const open = attempts.filter((a) => a.lifecycle === "open" && (a.activity === "quick" ? a.cardState !== "passed" : !a.completed)).sort((a, b) => (b.lastStudentActionAt ?? b.createdAt).localeCompare(a.lastStudentActionAt ?? a.createdAt))[0];
  const essays = data.completions.filter((c) => c.exposureKey === q.exposureKey && c.activity === "deep" && c.completedAt);
  const best = Math.max(...sessions.filter((s) => s.question?.exposureKey === q.exposureKey && s.evaluation).map((s) => Math.max(s.evaluation!.scores.overall, s.revisionScores?.overall ?? 0)));
  const card = attempts.some((a) => a.activity === "quick" && a.cardState === "passed");
  const [status, statusLabel] = open ? ["open", "进行中"] as const
    : essays.length ? ["written", `写过 ${essays.length} 篇`] as const
    : card ? ["card", "有卡片"] as const
    : ["new", "没练过"] as const;
  return { id: q.id, text: q.text, topic: q.primaryTopic, tags: [topicLabels[q.primaryTopic] ?? q.primaryTopic, questionTypeLabels[q.questionType] ?? q.questionType], status, statusLabel, best: essays.length && Number.isFinite(best) ? best.toFixed(1) : null, openAttemptId: open?.id ?? null };
}

function pickReason(pick: QuestionPick, q: Question) {
  switch (pick.reason) {
    case "first": return "从这一道开始";
    case "rarest_type": return `「${questionTypeLabels[q.questionType] ?? q.questionType}」这类题型你练得比较少`;
    case "new_topic": return `「${topicLabels[q.primaryTopic] ?? q.primaryTopic}」这个话题你还没练过`;
    case "rewrite": return "题都写过了，这道写得最早，可以重写";
    default: return "按你的练习进度，下一道练这个";
  }
}

function practiceRecords(userId: string, sessions: Sessions, data: Data, quickEnabled: boolean): PracticeRecord[] {
  const completed = new Set(data.completions.map((event) => event.attemptId));
  return sessions
    .filter((session) => session.activity === "deep" || quickEnabled)
    .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt))
    .map((session) => {
      const base = { id: session.id, prompt: session.prompt.text, date: formatDate(session.updatedAt || sessionDate(session)), lifecycle: session.lifecycle, completed: completed.has(session.id) };
      const aside = session.lifecycle === "set_aside" ? " · 已暂放" : session.lifecycle === "closed" ? " · 已关闭" : "";
      if (session.activity === "quick") {
        // A card's progress is its check state, not an essay stage.
        const state = getCard(userId, session.id)?.state;
        const [status, label] = state === "passed" ? ["done", "已通过"] as const : state === "needs_development" ? ["revising", "待完善"] as const : ["drafting", "写作中"] as const;
        return { ...base, kind: "卡片", status, statusLabel: label + aside, original: null, revision: null };
      }
      const kind = essayKindLabel(session);
      return { ...base, ...libraryEntryState(session, base.completed), kind: kind === "练习" ? "作文" : kind, original: session.evaluation?.scores.overall ?? null, revision: session.revisionScores?.overall ?? null };
    });
}
