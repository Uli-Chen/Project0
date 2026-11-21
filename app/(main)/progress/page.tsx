import { readFeatures } from "@/lib/config/features";
import { getTopicData } from "@/lib/db/queries/topics";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { MockScoreChart } from "@/components/pages/progress-charts";
import { IssueMemory } from "@/components/progress/issue-memory";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { requireUser } from "@/lib/auth/server";
import type { CSSProperties } from "react";
import { listSessions } from "@/lib/db/queries/sessions";
import { buildMemory, learningSummary, sessionDate } from "@/lib/learning/summary";

export const metadata = { title: "进展" };

export default async function ProgressPage() {
  const user = await requireUser();
  const sessions = listSessions(user.id);
  const summary = learningSummary(sessions, user.profile, getTopicData(user.id).completions);
  const perWeek = Number(user.profile.perWeek) || 0;
  const checkpointsEnabled = readFeatures().CHECKPOINTS_ENABLED;
  const practicePoints = summary.evaluated.filter(session => session.mode === "practice").slice().reverse().map((session, index) => ({ date: sessionDate(session), label: `第 ${index + 1} 篇`, overall: session.evaluation!.scores.overall, dims: session.evaluation!.scores.dims, revised: session.revisionScores ? { overall: session.revisionScores.overall, dims: session.revisionScores.dims } : undefined }));

  const enter = (i: number) => ({ "--i": i }) as CSSProperties;
  return (
    <div className="flex flex-col gap-10">
      <header className="motion-enter flex items-end justify-between gap-4" style={enter(0)}>
        <h1 className="page-heading">进展</h1>
        <Link href="/onboarding" className={buttonVariants({ variant: "outline", size: "sm" })}>{user.profile.onboardingCompleted ? "调整目标" : "设置目标"}</Link>
      </header>

      <section aria-label="目标" className="motion-stagger -mt-3 grid grid-cols-2 gap-x-10 gap-y-8 rounded-2xl bg-sunk px-7 py-6 md:grid-cols-4">
        <Stat label="目标分" value={summary.target?.toFixed(1) ?? "—"} />
        <Stat label={summary.countsDown ? "距考试" : "计划备考"} value={!user.profile.onboardingCompleted ? "—" : summary.examPassed ? "已过" : `${summary.weeks}`} unit={summary.examPassed ? undefined : "周"} />
        <Stat label="每周" value={perWeek ? `${perWeek}` : "—"} unit="次" />
        <div>
          <p className="text-[14px] text-muted-foreground">本周</p>
          <p className="mt-1.5 text-[28px] leading-none font-semibold tracking-[-0.03em] tabular-nums">{summary.weekCompleted}{perWeek > 0 && <span className="ml-1 text-base font-normal tracking-normal text-muted-foreground">/ {perWeek} 次</span>}</p>
          <Progress value={perWeek ? Math.min(100, (summary.weekCompleted / perWeek) * 100) : 0} className="mt-4" aria-label="本周完成进度" />
        </div>
      </section>

      <section className="motion-enter" style={enter(2)}>
        <SectionTitle title="成绩" meta="分数由 AI 预估，不是官方成绩" />
        {checkpointsEnabled && <Link href="/mock" className="mt-2 inline-flex items-center gap-1 text-[15px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">模考成绩和趋势在模考页<ArrowUpRight className="size-4" aria-hidden /></Link>}
        <div className="surface mt-4 p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"><h3 className="text-[15px] font-semibold">练习成绩</h3><p className="text-[14px] text-muted-foreground">练习有教练帮忙，分数只作参考。</p></div>
          {practicePoints.length ? <div className="mt-4"><MockScoreChart points={practicePoints} target={summary.target ?? undefined} summary /></div> : <Empty>完成第一篇作文的评估后，成绩会出现在这里。</Empty>}
        </div>
      </section>

      <section className="motion-enter" style={enter(3)}>
        <SectionTitle title="常见问题" />
        <div className="surface mt-3 px-5 pt-2 pb-4"><IssueMemory initial={buildMemory(sessions, user.profile)} excludedMemoryIds={user.profile.excludedMemoryIds} /></div>
      </section>
    </div>
  );
}

/** Why a mock is not in the independent-mock scores, in the learner's terms (stored reasons are internal). */
/** Shown while no independent mock is on offer, so the feature is visible before it is due: the
 * title (rules on demand), when it opens, and a start button that is not yet available. */
function SectionTitle({ title, meta }: { title: string; meta?: string }) {
  return <div className="flex items-baseline justify-between gap-4"><h2 className="section-heading">{title}</h2>{meta && <span className="meta">{meta}</span>}</div>;
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return <div><p className="text-[14px] text-muted-foreground">{label}</p><p className="mt-1.5 text-[28px] leading-none font-semibold tracking-[-0.03em] tabular-nums">{value}{unit && value !== "—" && <span className="ml-1.5 text-base font-normal tracking-normal text-muted-foreground">{unit}</span>}</p></div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="flex h-44 items-center justify-center px-6 text-center text-[15px] text-muted-foreground">{children}</p>;
}
