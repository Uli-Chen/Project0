import { checkpointScorePoints } from "@/lib/learning/checkpoints";
import { readFeatures } from "@/lib/config/features";
import { getTopicData } from "@/lib/db/queries/topics";
import { checkpointHistory } from "@/lib/db/checkpoints";
import { CheckpointInvitation } from "@/components/checkpoints/checkpoint-invitation";
import Link from "next/link";
import { MockScoreChart, PracticeDumbbell } from "@/components/pages/progress-charts";
import { IssueMemory } from "@/components/progress/issue-memory";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { requireUser } from "@/lib/auth/server";
import { listSessions } from "@/lib/db/queries/sessions";
import { buildMemory, learningSummary, sessionDate } from "@/lib/learning/summary";

export const metadata = { title: "进展" };

export default async function ProgressPage() {
  const user = await requireUser();
  const sessions = listSessions(user.id);
  const summary = learningSummary(sessions, user.profile, getTopicData(user.id).completions);
  const perWeek = Number(user.profile.perWeek) || 0;
  const checkpointsEnabled = readFeatures().CHECKPOINTS_ENABLED;
  const checkpoints = checkpointHistory(user.id);
  const qualified = new Set(checkpoints.filter(c => c.status === "eligible").map(c => c.attemptId));
  const otherMocks = summary.evaluated.filter(s => s.mode === "mock" && !qualified.has(s.id));
  const mockPoints = checkpointsEnabled ? checkpointScorePoints(sessions, checkpoints) : summary.evaluated.filter(session => session.mode === "mock").slice().reverse().map((session, index) => ({ date: sessionDate(session), label: `第 ${index + 1} 篇`, overall: session.evaluation!.scores.overall, dims: session.evaluation!.scores.dims }));
  const revisions = summary.evaluated.filter((session) => session.mode === "practice" && session.revisionScores).slice().reverse().map((session) => ({ date: sessionDate(session), original: session.evaluation!.scores.overall, revision: session.revisionScores!.overall }));

  return (
    <div className="flex flex-col gap-10">
      <header className="flex items-end justify-between gap-4">
        <h1 className="page-heading">进展</h1>
        <Link href="/onboarding" className={buttonVariants({ variant: "outline" })}>{user.profile.onboardingCompleted ? "调整目标" : "设置目标"}</Link>
      </header>

      <CheckpointInvitation />
      <section aria-label="目标" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border shadow-[var(--shadow-panel),0_0_0_1px_var(--border)] md:grid-cols-4 [&>div]:bg-sheet [&>div]:px-5 [&>div]:py-4.5">
        <Stat label="目标分" value={summary.target?.toFixed(1) ?? "—"} />
        <Stat label="距考试" value={summary.examPassed ? "已过" : `${summary.weeks}`} unit={summary.examPassed ? undefined : "周"} />
        <Stat label="每周" value={perWeek ? `${perWeek}` : "—"} unit="次" />
        <div>
          <p className="text-[13px] text-muted-foreground">本周</p>
          <p className="mt-2 font-serif text-[34px] leading-none font-medium tracking-tight tabular-nums">{summary.weekCompleted}<span className="font-sans text-sm font-normal text-muted-foreground"> / {perWeek || "—"} 次</span></p>
          <Progress value={perWeek ? Math.min(100, (summary.weekCompleted / perWeek) * 100) : 0} className="mt-3" aria-label="本周完成进度" />
        </div>
      </section>

      <section>
        <SectionTitle title="成绩" meta="AI 实验性预估，非官方成绩" />
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="surface p-5"><h3 className="mb-4 text-[15px] font-semibold">{checkpointsEnabled ? "合格检查点趋势" : "模考"}</h3>{mockPoints.length ? <MockScoreChart points={mockPoints} target={summary.target ?? undefined} /> : <Empty />}</div>
          <div className="surface p-5"><h3 className="mb-4 text-[15px] font-semibold">改写前后</h3>{revisions.length ? <PracticeDumbbell rows={revisions} /> : <Empty />}</div>
        </div>
      </section>

      {checkpointsEnabled && <section><SectionTitle title="其他模考（不计入基线与趋势）" /><ul className="surface mt-3 divide-y">{otherMocks.map(s=><li key={s.id} className="px-5 py-3"><Link className="font-serif text-[15px] hover:underline" href={`/essays/${s.id}`}>{s.prompt.text.slice(0,60)}</Link><span className="ml-2 text-sm font-medium tabular-nums">{s.evaluation!.scores.overall}</span><span className="ml-1 text-xs text-faint">AI 实验性预估</span><p className="text-xs text-muted-foreground">{checkpoints.find(c=>c.attemptId===s.id)?.reason ?? "非合格检查点或旧记录资格未知"}</p></li>)}</ul><p className="mt-3 text-xs text-muted-foreground">{checkpoints.find(c=>c.isBaseline)?.evidenceDeleted ? "首个合格基线原文已删除；基线记录保留，不用后来的练习替换。" : "首个合格检查点为基线；练习分与其他模考不作为进步依据。"}</p></section>}
      <section>
        <SectionTitle title="常见问题" />
        <div className="surface mt-3 px-5 pt-2 pb-4"><IssueMemory initial={buildMemory(sessions, user.profile)} excludedMemoryIds={user.profile.excludedMemoryIds} /></div>
      </section>
    </div>
  );
}

function SectionTitle({ title, meta }: { title: string; meta?: string }) {
  return <div className="flex items-baseline justify-between gap-4"><h2 className="section-heading">{title}</h2>{meta && <span className="meta">{meta}</span>}</div>;
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return <div><p className="text-[13px] text-muted-foreground">{label}</p><p className="mt-2 font-serif text-[34px] leading-none font-medium tracking-tight tabular-nums">{value}{unit && <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">{unit}</span>}</p></div>;
}

function Empty() {
  return <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-input bg-sunk text-sm text-muted-foreground">还没有数据，完成一篇评估后会出现在这里</div>;
}
