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
import { buildMemory, formatDate, learningSummary, sessionDate } from "@/lib/learning/summary";

export const metadata = { title: "进展" };

export default async function ProgressPage() {
  const user = await requireUser();
  const sessions = listSessions(user.id);
  const summary = learningSummary(sessions, user.profile, getTopicData(user.id).completions);
  const perWeek = Number(user.profile.perWeek) || 0;
  const checkpointsEnabled = readFeatures().CHECKPOINTS_ENABLED;
  const checkpoints = checkpointHistory(user.id);
  const lastEligible = checkpoints.filter(c => c.status === "eligible" && c.completedAt).map(c => c.completedAt!).sort().at(-1);
  const nextCheckpointAt = lastEligible ? new Date(Date.parse(lastEligible) + 14 * 86400000).toISOString() : null;
  const checkpointWaiting = Boolean(lastEligible) && Date.parse(lastEligible!) + 14 * 86400000 > new Date().getTime();
  const deepDone = sessions.some(s => s.activity === "deep" && s.evaluation);
  const qualified = new Set(checkpoints.filter(c => c.status === "eligible").map(c => c.attemptId));
  const otherMocks = summary.evaluated.filter(s => s.mode === "mock" && !qualified.has(s.id));
  const mockPoints = checkpointsEnabled ? checkpointScorePoints(sessions, checkpoints) : summary.evaluated.filter(session => session.mode === "mock").slice().reverse().map((session, index) => ({ date: sessionDate(session), label: `第 ${index + 1} 篇`, overall: session.evaluation!.scores.overall, dims: session.evaluation!.scores.dims }));
  const practicePoints = summary.evaluated.filter(session => session.mode === "practice").slice().reverse().map((session, index) => ({ date: sessionDate(session), label: `第 ${index + 1} 篇`, overall: session.evaluation!.scores.overall, dims: session.evaluation!.scores.dims }));
  const revisions = summary.evaluated.filter((session) => session.mode === "practice" && session.revisionScores).slice().reverse().map((session) => ({ date: sessionDate(session), original: session.evaluation!.scores.overall, revision: session.revisionScores!.overall }));

  return (
    <div className="flex flex-col gap-12">
      <header className="flex items-end justify-between gap-4">
        <h1 className="page-heading">进展</h1>
        <Link href="/onboarding" className={buttonVariants({ variant: "outline" })}>{user.profile.onboardingCompleted ? "调整目标" : "设置目标"}</Link>
      </header>

      <CheckpointInvitation fallback={checkpointsEnabled ? <CheckpointNote firstDeepDone={deepDone} nextAt={nextCheckpointAt} waiting={checkpointWaiting} /> : null} />
      <section aria-label="目标" className="grid grid-cols-2 gap-x-10 gap-y-8 border-y py-8 md:grid-cols-4">
        <Stat label="目标分" value={summary.target?.toFixed(1) ?? "—"} />
        <Stat label="距考试" value={!user.profile.onboardingCompleted ? "—" : summary.examPassed ? "已过" : `${summary.weeks}`} unit={summary.examPassed ? undefined : "周"} />
        <Stat label="每周" value={perWeek ? `${perWeek}` : "—"} unit="次" />
        <div>
          <p className="text-[15px] text-muted-foreground">本周</p>
          <p className="mt-2 text-[40px] leading-none font-semibold tracking-[-0.03em] tabular-nums">{summary.weekCompleted}{perWeek > 0 && <span className="ml-1 text-base font-normal tracking-normal text-muted-foreground">/ {perWeek} 次</span>}</p>
          <Progress value={perWeek ? Math.min(100, (summary.weekCompleted / perWeek) * 100) : 0} className="mt-3.5" aria-label="本周完成进度" />
        </div>
      </section>

      <section>
        <SectionTitle title="成绩" meta="分数由 AI 预估，不是官方成绩" />
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="surface p-6">
            {mockPoints.length ? <><h3 className="mb-4 text-[15px] font-semibold">{checkpointsEnabled ? "检查点成绩" : "模考"}</h3><MockScoreChart points={mockPoints} target={summary.target ?? undefined} /></>
              : practicePoints.length ? <><h3 className="text-[15px] font-semibold">练习原稿成绩</h3><p className="mt-1 mb-4 text-sm text-muted-foreground">练习有教练帮忙，分数只作参考。{checkpointsEnabled ? "做一次 40 分钟独立完成的检查点，这里会换成真实水平的变化。" : "模考成绩会单独显示在这里。"}</p><MockScoreChart points={practicePoints} target={summary.target ?? undefined} /></>
              : <><h3 className="mb-4 text-[15px] font-semibold">成绩变化</h3><Empty>完成第一篇作文的评估后，成绩会出现在这里。</Empty></>}
          </div>
          <div className="surface p-6"><h3 className="mb-4 text-[15px] font-semibold">改写前后</h3>{revisions.length ? <PracticeDumbbell rows={revisions} /> : <Empty>提交一篇改写稿后，这里会显示改写前后的分数。</Empty>}</div>
        </div>
      </section>

      {checkpointsEnabled && otherMocks.length > 0 && <section><SectionTitle title="其他模考" /><ul className="surface mt-3 divide-y">{otherMocks.map(s=><li key={s.id} className="px-5 py-3"><Link className="font-serif text-[15px] hover:underline" href={`/essays/${s.id}`}>{s.prompt.text.slice(0,60)}</Link><span className="ml-2 text-sm font-medium tabular-nums">{s.evaluation!.scores.overall}</span><span className="ml-1 text-xs text-faint">AI 实验性预估</span><p className="text-xs text-muted-foreground">{checkpoints.find(c=>c.attemptId===s.id)?.reason ?? "非合格检查点或旧记录资格未知"}</p></li>)}</ul><p className="mt-3 text-xs text-muted-foreground">{checkpoints.find(c=>c.isBaseline)?.evidenceDeleted ? "首个合格基线原文已删除；基线记录保留，不用后来的练习替换。" : "这些模考不是在检查点条件下完成的，不计入上面的成绩变化。"}</p></section>}
      <section>
        <SectionTitle title="常见问题" />
        <div className="surface mt-3 px-5 pt-2 pb-4"><IssueMemory initial={buildMemory(sessions, user.profile)} excludedMemoryIds={user.profile.excludedMemoryIds} /></div>
      </section>
    </div>
  );
}

/** Shown while no checkpoint is on offer, so the feature is visible before it is due. */
function CheckpointNote({ firstDeepDone, nextAt, waiting }: { firstDeepDone: boolean; nextAt: string | null; waiting: boolean }) {
  return (
    <section className="rounded-xl border border-dashed border-input px-5 py-4">
      <h2 className="font-medium">写作检查点</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        40 分钟独立完成的模考，用来记录不靠教练时的真实水平。
        {!firstDeepDone ? "完成第一篇精练后开放。" : waiting ? `两次检查点至少间隔两周，下一次在 ${formatDate(nextAt!)} 之后开放。` : "你选择了稍后再做，到时会在这里和首页提醒你。"}
      </p>
    </section>
  );
}

function SectionTitle({ title, meta }: { title: string; meta?: string }) {
  return <div className="flex items-baseline justify-between gap-4"><h2 className="section-heading">{title}</h2>{meta && <span className="meta">{meta}</span>}</div>;
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return <div><p className="text-[15px] text-muted-foreground">{label}</p><p className="mt-2 text-[40px] leading-none font-semibold tracking-[-0.03em] tabular-nums">{value}{unit && value !== "—" && <span className="ml-1.5 text-base font-normal tracking-normal text-muted-foreground">{unit}</span>}</p></div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-input bg-sunk px-6 text-center text-sm text-muted-foreground">{children}</div>;
}
