import { readFeatures } from "@/lib/config/features";
import { ArrowUpRight, Plus } from "lucide-react";
import Link from "next/link";
import { EssayTable, type EssayRow } from "@/components/library/essay-table";
import { NewEssayDialog, StartEssayButton } from "@/components/shell/new-essay";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { requireUser } from "@/lib/auth/server";
import { listSessions } from "@/lib/db/queries/sessions";
import { buildMemory, ESSAY_STATUS_LABEL, essayKindLabel, essayStatus, formatDate, learningSummary, sessionDate } from "@/lib/learning/summary";

export default async function LibraryPage() {
  const user = await requireUser();
  const sessions = listSessions(user.id);
  const summary = learningSummary(sessions, user.profile);
  const perWeek = Number(user.profile.perWeek) || 0;
  const issues = buildMemory(sessions, user.profile).filter((item) => item.kind === "thinking" && !item.deleted).sort((a, b) => b.seen - a.seen).slice(0, 3);
  const rows: EssayRow[] = [...sessions].sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt)).map((session) => {
    const status = essayStatus(session);
    return { id: session.id, prompt: session.prompt.text, kind: essayKindLabel(session), status, statusLabel: ESSAY_STATUS_LABEL[status], original: session.evaluation?.scores.overall ?? null, revision: session.revisionScores?.overall ?? null, date: formatDate(session.updatedAt || sessionDate(session)) };
  });

  return (
    <div className={user.profile.onboardingCompleted ? "grid gap-10 xl:grid-cols-[minmax(0,1fr)_240px]" : undefined}>
      <div className="min-w-0">
        <header className="flex items-center justify-between gap-4">
          <h1 className="page-heading">作文</h1>
          <NewEssayDialog focus={readFeatures().QUESTION_BANK_ENABLED ? undefined : summary.focus?.title} trigger={<Button><Plus />新建作文</Button>} />
        </header>

        {!user.profile.onboardingCompleted ? (
          <Banner title="设置目标与节奏" action={<Link href="/onboarding" className={buttonVariants()}>去设置</Link>} />
        ) : !summary.evaluated.length && (
          <Banner title="入门测试" meta="40 分钟 · 独立完成" action={<StartEssayButton kind="assessment" mode="mock">开始</StartEssayButton>} />
        )}

        <div className="mt-8">
          {rows.length ? <EssayTable rows={rows} /> : (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-20">
              <p className="font-serif text-xl">写第一篇</p>
              <NewEssayDialog focus={readFeatures().QUESTION_BANK_ENABLED ? undefined : summary.focus?.title} trigger={<Button variant="outline"><Plus />新建作文</Button>} />
            </div>
          )}
        </div>
      </div>

      {user.profile.onboardingCompleted && (
        <aside className="flex flex-col gap-8 xl:pt-14">
          <section>
            <div className="flex items-baseline justify-between"><h2 className="text-xs text-muted-foreground">本周</h2><span className="font-mono text-sm tabular-nums">{summary.weekCompleted}<span className="text-muted-foreground"> / {perWeek}</span></span></div>
            <Progress value={perWeek ? Math.min(100, (summary.weekCompleted / perWeek) * 100) : 0} className="mt-2.5" aria-label="本周完成进度" />
          </section>
          <section>
            <h2 className="text-xs text-muted-foreground">目标</h2>
            <p className="mt-1 font-mono text-3xl tracking-tight tabular-nums">{summary.target?.toFixed(1) ?? "—"}</p>
            <p className="meta mt-1">{summary.examPassed ? <Link href="/onboarding" className="text-warn underline underline-offset-4">考试日期已过</Link> : `${summary.weeks} 周 · 每周 ${perWeek} 次`}</p>
          </section>
          {issues.length > 0 && (
            <section>
              <h2 className="text-xs text-muted-foreground">常见问题</h2>
              <ul className="mt-2.5 flex flex-col gap-2">
                {issues.map((issue) => <li key={issue.id} className="flex items-baseline justify-between gap-3 text-[13px]"><span className="min-w-0 truncate">{issue.summary}</span><span className="meta">×{issue.seen}</span></li>)}
              </ul>
              <Link href="/progress" className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">进展<ArrowUpRight className="size-3" /></Link>
            </section>
          )}
        </aside>
      )}
    </div>
  );
}

function Banner({ title, meta, action }: { title: string; meta?: string; action: React.ReactNode }) {
  return (
    <div className="mt-6 flex items-center justify-between gap-4 rounded-xl border bg-sheet px-5 py-4">
      <div><p className="text-sm font-medium">{title}</p>{meta && <p className="meta mt-0.5">{meta}</p>}</div>
      {action}
    </div>
  );
}
