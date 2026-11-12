import { topicLabels } from '@/lib/question-bank/labels';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { CurrentUser } from '@/lib/auth/types';
import { getTopicData } from '@/lib/db/queries/topics';
import { listSessions } from '@/lib/db/queries/sessions';
import { libraryEntryState } from '@/lib/learning/library';
import { dueItems, reviewItems } from '@/lib/learning/review-items';
import { formatDate, learningSummary } from '@/lib/learning/summary';
import { countWords } from '@/lib/rules/text';
import { CheckpointInvitation } from '@/components/checkpoints/checkpoint-invitation';
import { StartPractice } from '@/components/topics/start-practice';
import { WeekPips } from '@/components/topics/week-pips';
import { cn } from '@/lib/utils';

/** 本周一的日期，用来区分不同周的进度记录 */
function weekKey() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const onInk = 'bg-white text-[#101216] hover:bg-white/85';
const ghostOnInk = 'inline-flex h-12 items-center rounded-full px-5 text-base text-white/75 transition-colors hover:bg-white/10 hover:text-white';

export function TopicHome({ user, quickEnabled }: { user: CurrentUser; quickEnabled: boolean }) {
  const { profile } = user;
  const data = getTopicData(user.id);
  const sessions = listSessions(user.id);
  const resume = data.resume ? sessions.find((s) => s.id === data.resume!.id) ?? null : null;
  const summary = learningSummary(sessions.filter((s) => s.activity === 'deep'), profile, data.completions);
  const perWeek = Number(profile.perWeek) || 0;
  const week = data.counts.weekCompleted;
  const due = dueItems(reviewItems(sessions), profile.review ?? {}).length;
  const topic = data.lastTopic ?? data.topics[0]?.topic ?? null;
  const topicData = !resume && topic ? getTopicData(user.id, topic) : null;
  const pick = topicData?.recommendation ?? null;
  const offer = pick && (pick.kind === 'new' || pick.kind === 'rewrite') ? pick : null;
  const question = offer ? topicData!.questions.find((q) => q.id === offer.questionId) ?? null : null;
  const today = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Taipei', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());

  return (
    <div className="flex flex-col">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-[15px] text-muted-foreground">{today}</p>
          <h1 className="page-heading mt-1.5">今天</h1>
        </div>
        <div className="text-right">
          <p className="text-[15px] text-muted-foreground">本周已练 <span className="text-[17px] font-semibold text-foreground tabular-nums">{week}</span>{perWeek > 0 ? ` / ${perWeek} 次` : ' 次'}</p>
          {perWeek > 0 && <WeekPips week={week} perWeek={perWeek} weekKey={weekKey()} />}
          {data.counts.unknownDate > 0 && <p className="meta mt-1.5">另有 {data.counts.unknownDate} 次日期未知</p>}
        </div>
      </header>

      <section aria-label="今天的安排" className="ink-panel mt-7 grid lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-h-[19rem] flex-col px-7 py-8 sm:px-10 sm:py-10">
          {resume ? <Resume session={resume} /> : question && offer ? (
            <>
              <p className="text-[15px] font-medium text-white/70">{offer.kind === 'rewrite' ? '今天重写这道题' : offer.activity === 'quick' ? '今天先用一张卡片把想法理清' : '今天写这篇'}，{topicLabels[topic!] ?? topic}</p>
              <p className="mt-4 line-clamp-6 max-w-[30em] font-serif text-[21px] leading-[1.45] sm:text-[26px] sm:leading-[1.4] text-pretty text-white">{question.text}</p>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-8">
                {offer.kind === 'rewrite'
                  ? <StartPractice size="lg" className={onInk} questionId={offer.questionId} activity="deep" rewriteOfDeepId={offer.rewriteOfDeepId}>同题重写</StartPractice>
                  : <StartPractice size="lg" className={onInk} questionId={offer.questionId} activity={offer.activity} continueFromQuickId={offer.continueFromQuickId} explicitNew={offer.needsExplicitNew}>{offer.needsExplicitNew ? '另开一次精练' : offer.continueFromQuickId ? '用卡片写成作文' : offer.activity === 'quick' ? `开始速刷，约 10 分钟` : `开始精练${profile.minutes ? `，约 ${profile.minutes} 分钟` : ''}`}</StartPractice>}
                <Link href="#topics" className={ghostOnInk}>换一题</Link>
              </div>
            </>
          ) : (
            <>
              <p className="text-[15px] font-medium text-white/70">{pick?.kind === 'resume' ? '这个主题还有没写完的练习' : '选一个主题开始'}</p>
              <p className="mt-4 max-w-[26em] text-[21px] leading-[1.4] font-semibold sm:text-[26px] sm:leading-[1.35] tracking-tight text-white">{quickEnabled ? '速刷用卡片整理想法，精练从思路写到完整作文。' : '从思路写到完整作文，拿到写作反馈。'}</p>
              <div className="mt-auto pt-8"><Link href={pick?.kind === 'resume' ? `/essays/${pick.attemptId}` : '#topics'} className={cn('inline-flex h-12 items-center rounded-full px-7 text-base font-medium', onInk)}>{pick?.kind === 'resume' ? '继续练习' : '去选题'}</Link></div>
            </>
          )}
        </div>
        <ul className="flex flex-col divide-y divide-white/10 border-t border-white/10 px-7 py-2 text-[15px] lg:border-t-0 lg:border-l lg:px-8 lg:py-6">
          <Aside label="先复习" href={due > 0 ? '/cards' : undefined}>{due > 0 ? `${due} 条到期，约 ${Math.max(2, Math.round(due * 0.7))} 分钟` : '今天没有到期的内容'}</Aside>
          {summary.focus && <Aside label="这次留意" href="/progress">{summary.focus.title}</Aside>}
          {profile.onboardingCompleted
            ? <Aside label="目标" href="/progress">{summary.target?.toFixed(1)} 分，{summary.examPassed ? '考试日期已过' : `还有 ${summary.weeks} 周`}</Aside>
            : <Aside label="目标" href="/onboarding">设置目标分数和每周节奏</Aside>}
        </ul>
      </section>

      <div className="mt-4 empty:hidden"><CheckpointInvitation /></div>

      <section id="topics" className="mt-16 scroll-mt-10">
        <h2 className="section-heading">全部主题</h2>
        <div className="mt-6 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
          {data.topics.map((t) => {
            const pct = t.total ? Math.min(100, (t.completed / t.total) * 100) : 0;
            return (
              <Link key={t.topic} href={`/topics/${encodeURIComponent(t.topic)}`} className="group flex flex-col gap-3 border-t py-5 transition-colors hover:border-foreground">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[19px] font-semibold tracking-tight">{topicLabels[t.topic] ?? t.topic}</span>
                  <ArrowUpRight className="size-[18px] text-muted-foreground transition-transform duration-(--dur-standard) ease-(--ease-soft) group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" aria-hidden />
                </span>
                <span className="h-1 overflow-hidden rounded-full bg-sunk" aria-hidden><span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></span>
                <span className="flex items-baseline justify-between gap-3 text-[15px] text-muted-foreground">
                  <span className="tabular-nums">{t.completed || t.startedOnly ? `完成 ${t.completed}${t.total ? ` / ${t.total}` : ''} 题${t.startedOnly > 0 ? `，开始过 ${t.startedOnly} 题` : ''}` : `${t.total} 道题，还没练过`}</span>
                  {t.lastPractisedAt && <span className="shrink-0">{t.topic === data.lastTopic ? '上次练到这里，' : ''}{formatDate(t.lastPractisedAt)}</span>}
                </span>
                {quickEnabled && (t.passedCards > 0 || t.draftCards > 0) && <span className="-mt-1.5 text-[15px] text-muted-foreground tabular-nums">观点卡片 {t.passedCards} 张{t.draftCards > 0 ? `，另有 ${t.draftCards} 张没写完` : ''}</span>}
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Aside({ label, href, children }: { label: string; href?: string; children: React.ReactNode }) {
  const body = <><span className="block text-sm text-white/60">{label}</span><span className="mt-1 flex items-center justify-between gap-3 leading-snug text-white">{children}{href && <ArrowUpRight className="size-4 shrink-0 text-white/50 transition-colors group-hover:text-white" aria-hidden />}</span></>;
  return <li>{href ? <Link href={href} className="group block py-4">{body}</Link> : <div className="py-4">{body}</div>}</li>;
}

type Session = ReturnType<typeof listSessions>[number];

function Resume({ session }: { session: Session }) {
  const quick = session.activity === 'quick';
  const kind = session.stage === 'revising' && session.drafts.revision ? 'revision' : 'original';
  const words = countWords(session.drafts[kind] ?? '');
  const minutes = Math.round((session.elapsed?.[kind] ?? 0) / 60);
  const topic = session.question?.primaryTopic;
  const { statusLabel } = libraryEntryState(session, false);
  const label = quick ? '速刷卡片' : session.mode === 'mock' ? '模考' : '精练';
  return (
    <>
      <p className="text-[15px] font-medium text-white/70">接着上次的{label}{topic ? `，${topicLabels[topic] ?? topic}` : ''}</p>
      <p className="mt-4 line-clamp-6 max-w-[30em] font-serif text-[21px] leading-[1.45] sm:text-[26px] sm:leading-[1.4] text-pretty text-white">{session.prompt.text}</p>
      <p className="mt-4 text-[15px] text-white/70">{statusLabel}{!quick && words > 0 ? `，已写 ${words} 词` : ''}{!quick && minutes > 0 ? `，用时 ${minutes} 分钟` : ''}</p>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-8">
        <Link href={`/essays/${session.id}`} className={cn('inline-flex h-12 items-center rounded-full px-7 text-base font-medium transition-colors', onInk)}>{quick ? '继续写卡片' : words ? '继续写作' : '开始写作'}</Link>
        <Link href="#topics" className={ghostOnInk}>换一题</Link>
      </div>
    </>
  );
}
