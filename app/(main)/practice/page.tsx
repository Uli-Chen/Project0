import Link from "next/link";
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
import { PracticeRecords, type PracticeRecord } from "@/components/practice/practice-records";
import { QuestionBank, type BankQuestion } from "@/components/practice/question-bank";
import { cn } from "@/lib/utils";

export const metadata = { title: "练习" };

type Params = { tab?: string; type?: string; topic?: string };

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
  const tabs = (
    <nav aria-label="练习" className="flex gap-6">
      <TabLink href="/practice" active={tab === "bank"}>题库</TabLink>
      <TabLink href="/practice?tab=records" active={tab === "records"}>我的练习 <span className="tabular-nums text-muted-foreground">{records.length}</span></TabLink>
    </nav>
  );

  if (tab === "records") return (
    <div className="flex flex-col">
      <h1 className="page-heading">练习</h1>
      <div className="mt-8 border-b">{tabs}</div>
      {records.length ? <PracticeRecords rows={records} /> : <p className="py-16 text-center text-[15px] text-muted-foreground">还没有练习</p>}
    </div>
  );

  const practice = data.questions.filter((q) => q.pool === "practice");
  const all = practice.map((q) => bankQuestion(q, data, sessions));
  const type = params.type && questionTypeLabels[params.type] ? params.type : null;
  const topic = params.topic && data.topics.some((t) => t.topic === params.topic) ? params.topic : null;
  const shown = all.filter((_, i) => (!type || practice[i].questionType === type) && (!topic || practice[i].primaryTopic === topic));
  const picked = pickQuestion(data.questions, data.completions, data.attempts);
  const pickedQuestion = picked && all.find((q) => q.id === picked.questionId);
  const pick = picked && pickedQuestion ? { question: pickedQuestion, reason: pickReason(picked, data.questions.find((q) => q.id === picked.questionId)!) } : null;
  const href = (next: { type?: string | null; topic?: string | null }) => {
    const query = new URLSearchParams(Object.entries({ type, topic, ...next }).filter((entry): entry is [string, string] => !!entry[1]));
    return query.size ? `/practice?${query}` : "/practice";
  };

  const filters = (
    <div className="flex flex-col gap-3">
      <FilterRow label="题型" options={Object.entries(questionTypeLabels)} active={type} href={(value) => href({ type: value })} />
      <FilterRow label="话题" options={data.topics.map((t) => [t.topic, topicLabels[t.topic] ?? t.topic])} active={topic} href={(value) => href({ topic: value })} />
    </div>
  );

  return (
    <div className="flex flex-col">
      <h1 className="page-heading">练习</h1>
      <QuestionBank tabs={tabs} filters={filters} questions={shown} pick={pick} quickEnabled={features.QUICK_ENABLED} />
    </div>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return <Link href={href} aria-current={active ? "page" : undefined} className={cn("-mb-px border-b-2 pb-3 text-[16px] transition-colors", active ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{children}</Link>;
}

function FilterRow({ label, options, active, href }: { label: string; options: [string, string][]; active: string | null; href: (value: string | null) => string }) {
  const chip = (selected: boolean) => cn("rounded-full px-3 py-1 text-[14px] transition-colors", selected ? "bg-foreground text-background" : "text-muted-foreground hover:bg-sunk hover:text-foreground");
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1">
      <span className="mr-3 w-8 text-[14px] text-muted-foreground">{label}</span>
      <Link href={href(null)} aria-current={active === null ? "true" : undefined} className={chip(active === null)}>全部</Link>
      {options.map(([value, name]) => <Link key={value} href={href(value)} aria-current={active === value ? "true" : undefined} className={chip(active === value)}>{name}</Link>)}
    </div>
  );
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
    : essays.length ? ["written", `写过 ${essays.length} 篇${Number.isFinite(best) ? ` · 最高 ${best.toFixed(1)}` : ""}`] as const
    : card ? ["card", "有卡片"] as const
    : ["new", "没练过"] as const;
  return { id: q.id, text: q.text, meta: [topicLabels[q.primaryTopic] ?? q.primaryTopic, questionTypeLabels[q.questionType] ?? q.questionType], status, statusLabel, openAttemptId: open?.id ?? null };
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
