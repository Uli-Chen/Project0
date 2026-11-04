import { libraryEntryState } from "@/lib/learning/library";
import { getTopicData } from "@/lib/db/queries/topics";
import { readFeatures } from "@/lib/config/features";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { EssayTable, type EssayRow } from "@/components/library/essay-table";
import { NewEssayButton, NewEssayDialog, StartEssayButton } from "@/components/shell/new-essay";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { requireUser } from "@/lib/auth/server";
import { listSessions } from "@/lib/db/queries/sessions";
import { buildMemory, essayKindLabel, formatDate, learningSummary, sessionDate } from "@/lib/learning/summary";

export default async function LibraryPage() {
  const user = await requireUser();
  const sessions = listSessions(user.id).filter(s => s.activity === "deep");
  const completions = getTopicData(user.id).completions;
  const completedIds = new Set(completions.map(event => event.attemptId));
  const summary = learningSummary(sessions, user.profile, completions);
  const bankEnabled = readFeatures().QUESTION_BANK_ENABLED;
  const perWeek = Number(user.profile.perWeek) || 0;
  const issues = buildMemory(sessions, user.profile).filter((item) => item.kind === "thinking" && !item.deleted).sort((a, b) => b.seen - a.seen).slice(0, 3);
  const rows: EssayRow[] = [...sessions].sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt)).map((session) => {
    const state = libraryEntryState(session, completedIds.has(session.id));
    return { id: session.id, prompt: session.prompt.text, kind: essayKindLabel(session), ...state, original: session.evaluation?.scores.overall ?? null, revision: session.revisionScores?.overall ?? null, date: formatDate(session.updatedAt || sessionDate(session)) };
  });

  return (
    <div className={user.profile.onboardingCompleted ? "grid gap-8 xl:grid-cols-[minmax(0,1fr)_256px]" : undefined}>
      <div className="min-w-0">
        <header className="flex items-end justify-between gap-4">
          <h1 className="page-heading">作文</h1>
          <div className="flex flex-wrap justify-end gap-2">{bankEnabled && <NewEssayDialog pasteOnly trigger={<Button variant="outline">粘贴题目</Button>} />}<NewEssayButton bankEnabled={bankEnabled} focus={summary.focus?.title} /></div>
        </header>

        {!user.profile.onboardingCompleted ? (
          <Banner title="设置目标与节奏" action={<Link href="/onboarding" className={buttonVariants()}>去设置</Link>} />
        ) : !readFeatures().QUESTION_BANK_ENABLED && !summary.evaluated.length && (
          <Banner title="入门测试" meta="40 分钟 · 独立完成" action={<StartEssayButton kind="assessment" mode="mock">开始</StartEssayButton>} />
        )}

        <div className="mt-8">
          {rows.length ? <EssayTable rows={rows} /> : (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-input bg-sunk py-20">
              <p className="text-[19px] font-semibold">写第一篇</p>
              <p className="-mt-2 text-sm text-muted-foreground">选一道题，从提纲写到完整作文。</p>
              <NewEssayButton bankEnabled={bankEnabled} focus={summary.focus?.title} variant="outline" />
            </div>
          )}
        </div>
      </div>

      {user.profile.onboardingCompleted && (
        <aside className="surface flex h-fit flex-col divide-y self-start xl:mt-[60px]">
          <section className="px-5 py-4">
            <div className="flex items-baseline justify-between"><h2 className="text-[13px] text-muted-foreground">本周已练</h2><span className="text-[15px] font-semibold tabular-nums">{summary.weekCompleted}<span className="font-normal text-muted-foreground"> / {perWeek} 次</span></span></div>
            <Progress value={perWeek ? Math.min(100, (summary.weekCompleted / perWeek) * 100) : 0} className="mt-2.5" aria-label="本周完成进度" />
          </section>
          <section className="px-5 py-4">
            <h2 className="text-[13px] text-muted-foreground">目标分数</h2>
            <p className="mt-1 font-serif text-[40px] leading-none font-medium tracking-tight tabular-nums">{summary.target?.toFixed(1) ?? "—"}</p>
            <p className="meta mt-1">{summary.examPassed ? <Link href="/onboarding" className="text-warn underline underline-offset-4">考试日期已过</Link> : `还有 ${summary.weeks} 周，每周 ${perWeek} 次`}</p>
          </section>
          {issues.length > 0 && (
            <section className="px-5 py-4">
              <h2 className="text-[13px] text-muted-foreground">常见问题</h2>
              <ul className="mt-2.5 flex flex-col gap-2">
                {issues.map((issue) => <li key={issue.id} className="flex items-baseline justify-between gap-3 text-[13px]"><span className="min-w-0 truncate">{issue.summary}</span><span className="meta shrink-0">{issue.seen} 次</span></li>)}
              </ul>
              <Link href="/progress" className="mt-3 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">查看进展<ArrowUpRight className="size-3" /></Link>
            </section>
          )}
        </aside>
      )}
    </div>
  );
}

function Banner({ title, meta, action }: { title: string; meta?: string; action: React.ReactNode }) {
  return (
    <div className="lead mt-6 flex items-center justify-between gap-4 py-5 pr-6 pl-8">
      <div><p className="text-[17px] font-semibold">{title}</p>{meta && <p className="meta mt-0.5">{meta}</p>}</div>
      {action}
    </div>
  );
}
