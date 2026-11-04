import { topicLabels } from '@/lib/question-bank/labels';
import Link from 'next/link';
import { getTopicData } from '@/lib/db/queries/topics';
import { listSessions } from '@/lib/db/queries/sessions';
import { libraryEntryState } from '@/lib/learning/library';
import { formatDate } from '@/lib/learning/summary';
import { countWords } from '@/lib/rules/text';
import { CheckpointInvitation } from '@/components/checkpoints/checkpoint-invitation';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function TopicHome({ userId, onboardingCompleted, quickEnabled, perWeek, target }: { userId: string; onboardingCompleted: boolean; quickEnabled: boolean; perWeek: number; target: string | null }) {
  const data = getTopicData(userId);
  const resume = data.resume ? listSessions(userId).find((s) => s.id === data.resume!.id) ?? null : null;
  const week = data.counts.weekCompleted;

  return (
    <div className="flex flex-col">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="page-heading">练习</h1>
          {target && <p className="mt-2 text-sm text-muted-foreground">目标分数 {Number(target).toFixed(1)}</p>}
        </div>
        <div className="text-right">
          <p className="text-[13px] text-muted-foreground">本周已练 <span className="text-[15px] font-semibold text-foreground tabular-nums">{week}</span>{perWeek > 0 && <> / {perWeek} 次</>}{perWeek === 0 && ' 次'}</p>
          {perWeek > 0 && (
            <div className="mt-2 flex justify-end gap-1" aria-hidden>
              {Array.from({ length: Math.min(perWeek, 14) }, (_, i) => <span key={i} className={cn('h-1.5 w-6 rounded-full', i < week ? 'bg-primary' : 'bg-border')} />)}
            </div>
          )}
          {data.counts.unknownDate > 0 && <p className="meta mt-1.5">另有 {data.counts.unknownDate} 次日期未知</p>}
        </div>
      </header>

      {resume && <ResumeBlock session={resume} />}
      {!resume && !onboardingCompleted && <StartBlock quickEnabled={quickEnabled} />}

      <div className="mt-3.5 empty:hidden"><CheckpointInvitation /></div>
      {resume && !onboardingCompleted && (
        <p className="mt-3.5 text-sm text-muted-foreground">还没设置目标分数和练习节奏？<Link href="/onboarding" className="text-foreground underline underline-offset-4">现在设置</Link></p>
      )}

      <section id="topics" className="mt-10 scroll-mt-8">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="section-heading">选择主题</h2>
          <span className="text-[13px] text-muted-foreground">先选主题，再挑题目</span>
        </div>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl bg-border shadow-[var(--shadow-panel),0_0_0_1px_var(--border)] sm:grid-cols-2 lg:grid-cols-4">
          {data.topics.map((t) => {
            const last = t.topic === data.lastTopic;
            const pct = t.total ? Math.min(100, (t.completed / t.total) * 100) : 0;
            return (
              <Link key={t.topic} href={`/topics/${encodeURIComponent(t.topic)}`} className={cn('flex min-h-32 flex-col gap-2.5 bg-sheet px-5 py-4.5 transition-colors hover:bg-[color-mix(in_oklch,var(--sheet),var(--primary)_6%)]', last && 'shadow-[inset_0_0_0_2px_var(--coach-line)]')}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[17px] font-semibold">{topicLabels[t.topic] ?? t.topic}</span>
                  {last && <span className="text-xs text-faint">上次在这里</span>}
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-sunk shadow-[inset_0_0_0_1px_var(--border)]" aria-hidden><span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></span>
                <span className="mt-auto flex flex-col gap-0.5 text-[12.5px] text-muted-foreground">
                  {t.completed || t.startedOnly ? (
                    <span className="flex justify-between gap-2"><span className="tabular-nums">完成 {t.completed}{t.total ? ` / ${t.total}` : ''} 题{t.startedOnly > 0 && `，开始过 ${t.startedOnly} 题`}</span>{t.lastPractisedAt && <span className="shrink-0">{formatDate(t.lastPractisedAt)}</span>}</span>
                  ) : <span className="text-faint">还没练过</span>}
                  {quickEnabled && (t.passedCards > 0 || t.draftCards > 0) && <span className="tabular-nums">卡片：通过 {t.passedCards}，草稿与待复查 {t.draftCards}</span>}
                </span>
              </Link>
            );
          })}
          {Array.from({ length: (4 - (data.topics.length % 4)) % 4 }, (_, i) => <span key={i} aria-hidden className="hidden bg-sunk lg:block" />)}
        </div>
      </section>
    </div>
  );
}

type Session = ReturnType<typeof listSessions>[number];

function ResumeBlock({ session }: { session: Session }) {
  const quick = session.activity === 'quick';
  const kind = session.stage === 'revising' && session.drafts.revision ? 'revision' : 'original';
  const draft = session.drafts[kind] ?? '';
  const words = countWords(draft);
  const minutes = Math.round((session.elapsed?.[kind] ?? 0) / 60);
  const topic = session.question?.primaryTopic;
  const paragraphs = draft.split(/\n+/).map((p) => p.trim()).filter(Boolean).slice(0, 3);
  const { statusLabel } = libraryEntryState(session, false);

  return (
    <section aria-label="继续上次练习" className={cn('lead mt-6 grid', !quick && 'md:grid-cols-[minmax(0,1fr)_360px]')}>
      <div className="flex flex-col py-6 pr-7 pl-8">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          继续上次练习
          {topic && <Badge variant="outline">{topicLabels[topic] ?? topic}</Badge>}
          <Badge variant="outline">{quick ? '速刷' : '精练'}</Badge>
        </div>
        <p className="mt-3.5 line-clamp-4 max-w-[34em] font-serif text-[21px] leading-[1.45] text-pretty">{session.prompt.text}</p>
        <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
          <span>{statusLabel}</span>
          {!quick && <span>已写 <b className="font-semibold text-foreground tabular-nums">{words}</b> 词</span>}
          {!quick && minutes > 0 && <span>用时 <b className="font-semibold text-foreground tabular-nums">{minutes}</b> 分钟</span>}
        </p>
        <div className="mt-auto flex items-center gap-2.5 pt-6">
          <Link href={`/essays/${session.id}`} className={buttonVariants()}>{quick ? '继续写卡片' : words ? '继续写作' : '开始写作'}</Link>
          <Link href="#topics" className={buttonVariants({ variant: 'ghost' })}>换一题</Link>
        </div>
      </div>
      {!quick && (
        <div aria-hidden className="relative hidden overflow-hidden border-l bg-sunk pt-6 pl-7 md:block">
          <div className="paper relative h-full min-h-56 rounded-tr-none rounded-br-none rounded-bl-none px-6 py-5 font-serif text-[13.5px] leading-[1.75]">
            <p className="border-b pb-2.5 text-xs leading-normal text-faint italic line-clamp-2">{session.prompt.text}</p>
            {paragraphs.length ? paragraphs.map((p, i) => <p key={i} className="mt-2.5 line-clamp-4">{p}</p>) : <p className="mt-3 text-faint">还没有开始写。</p>}
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-paper" />
          </div>
        </div>
      )}
    </section>
  );
}

function StartBlock({ quickEnabled }: { quickEnabled: boolean }) {
  return (
    <section aria-label="开始练习" className="lead mt-6 flex flex-wrap items-end justify-between gap-6 py-6 pr-7 pl-8">
      <div className="max-w-[40em]">
        <h2 className="text-[21px] font-semibold tracking-tight">按自己的节奏开始</h2>
        <p className="mt-2 text-muted-foreground">{quickEnabled ? '速刷：用卡片整理想法，不用写整篇。精练：从思路到完整作文，拿到写作反馈。' : '精练：从思路到完整作文，拿到写作反馈。'}</p>
        <p className="mt-1 text-muted-foreground">可以先设置目标分数和练习节奏，也可以直接选题。</p>
      </div>
      <div className="flex gap-2.5">
        <Link href="/onboarding" className={buttonVariants()}>设置目标与节奏</Link>
        <Link href="#topics" className={buttonVariants({ variant: 'outline' })}>先去选题</Link>
      </div>
    </section>
  );
}
