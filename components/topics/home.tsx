import { questionTypeLabels, topicLabels } from '@/lib/question-bank/labels';
import Link from 'next/link';
import type { CurrentUser } from '@/lib/auth/types';
import { getTopicData } from '@/lib/db/queries/topics';
import { listSessions } from '@/lib/db/queries/sessions';
import { libraryEntryState } from '@/lib/learning/library';
import { dueItems, reviewItems } from '@/lib/learning/review-items';
import { examTime, learningSummary } from '@/lib/learning/summary';
import { fixedIssues } from '@/lib/learning/fixes';
import { countWords } from '@/lib/rules/text';
import { StartPractice } from '@/components/topics/start-practice';
import { Row, Big } from '@/components/topics/home-row';
import { PracticeHeatmap } from '@/components/topics/practice-heatmap';
import { WeekPips } from '@/components/topics/week-pips';
import { cn } from '@/lib/utils';

/** 本周一的日期，用来区分不同周的进度记录 */
function weekKey() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// Minutes shown for a card and for an essay with its feedback.
const CARD_MINUTES = 10, ESSAY_MINUTES = 50;
const ghostPill = 'inline-flex h-12 items-center rounded-full px-5 text-base text-muted-foreground transition-colors hover:bg-sunk hover:text-foreground';
const solidPill = 'inline-flex h-12 items-center rounded-full bg-foreground px-7 text-base font-medium text-background transition-colors hover:bg-foreground/85';

/** 今天: one recommended practice led by its question, then a short numbered list of where the learner stands. */
export function TopicHome({ user, quickEnabled }: { user: CurrentUser; quickEnabled: boolean }) {
  const { profile } = user;
  const data = getTopicData(user.id);
  const sessions = listSessions(user.id);
  const resume = data.resume ? sessions.find((s) => s.id === data.resume!.id) ?? null : null;
  const topic = data.lastTopic ?? data.topics[0]?.topic ?? null;
  const topicData = !resume && topic ? getTopicData(user.id, topic) : null;
  const pick = topicData?.recommendation ?? null;
  const offer = pick && (pick.kind === 'new' || pick.kind === 'rewrite') ? pick : null;
  const question = offer ? topicData!.questions.find((q) => q.id === offer.questionId) ?? null : null;
  const today = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Taipei', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());

  // Practice is a completed essay or a passed card.
  const practised = data.completions.filter((c) => c.activity === 'quick' || c.completedAt);
  const perWeek = Number(profile.perWeek) || 0;
  const week = data.counts.weekCompleted;
  const essays = data.completions.filter((c) => c.activity === 'deep' && c.completedAt).length;
  const cards = data.topics.reduce((sum, t) => sum + t.passedCards, 0);
  const fixed = fixedIssues(sessions);
  const focus = learningSummary(sessions.filter((s) => s.activity === 'deep'), profile).focus;
  const due = dueItems(reviewItems(sessions), profile.review ?? {}).length;
  const time = examTime(profile);

  // Why this question, as specific to the learner as the data allows.
  const typeName = question ? questionTypeLabels[question.questionType] ?? question.questionType : '';
  const typeCounts = Object.keys(questionTypeLabels).map((type) => practised.filter((c) => c.questionType === type).length);
  const rarestType = !!question && practised.length > 0 && practised.filter((c) => c.questionType === question.questionType).length === Math.min(...typeCounts);
  const reason = !offer ? '' : offer.kind === 'rewrite' ? '这个主题的题都写过了，重写最早的一道'
    : offer.continueFromQuickId ? '这道题你已经有卡片，可以直接写成作文'
    : practised.length === 0 ? (offer.activity === 'quick' ? '从一张卡片开始，先把想法理清' : '从第一篇作文开始')
    : rarestType ? `「${typeName}」这类题型你练得比较少`
    : offer.activity === 'quick' ? '这个主题你还没练过，先用一张卡片理清想法' : '一道你还没写过的题';
  const alternative = offer?.kind === 'new' && !offer.continueFromQuickId && !offer.needsExplicitNew
    ? (offer.activity === 'quick' ? { activity: 'deep' as const, label: '直接写作文' } : quickEnabled ? { activity: 'quick' as const, label: '先做卡片' } : null)
    : null;

  // Always the same five rows, so a new learner sees what will fill up.
  const dueText = due > 0 ? <span className="text-[17px]">{due} 条到期<span className="text-muted-foreground"> · 约 {Math.max(2, Math.round(due * 0.7))} 分钟</span></span> : <span className="text-[17px] text-muted-foreground">今天没有到期的</span>;
  const rows = [
    <Row key="due" n={1} label="先复习" href="/cards">{dueText}</Row>,
    <Row key="focus" n={2} label="这次留意" href={focus ? '/progress' : undefined}><span className={cn('text-[17px]', !focus && 'text-muted-foreground')}>{focus ? focus.title : '—'}</span></Row>,
    <Row key="fixed" n={3} label="改好的问题" href={fixed.length ? '/progress' : undefined}><Big value={fixed.length} unit="个" note={fixed[0] ? `最近：${fixed[0].title}` : undefined} /></Row>,
    <Row key="done" n={4} label="已完成" href={essays ? '/essays' : undefined}><Big value={essays} unit={`篇作文 · ${cards} 张卡片`} /></Row>,
    <Row key="new" n={5} label="新的练习" href="/practice"><span className="text-[17px]">全部主题和题目</span></Row>,
  ];
  // Days with practice: a practice started, last worked on or completed.
  const activity = [...data.attempts.flatMap((a) => [a.createdAt, a.lastStudentActionAt]), ...data.completions.map((c) => c.completedAt)];

  return (
    <div className="flex flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-[15px] text-muted-foreground">
        <p>
          {today}
          <span className="mx-2 text-faint">·</span>
          {!profile.onboardingCompleted
            ? <Link href="/onboarding" className="text-foreground underline underline-offset-4">设置目标</Link>
            : time.examPassed ? <span className="text-warn">考试日期已过</span>
            : time.countsDown ? <>距考试 <b className="font-semibold text-foreground tabular-nums">{time.weeks}</b> 周</>
            : time.timeLeft}
        </p>
        {perWeek > 0 && (
          <div className="flex items-center gap-3">
            <WeekPips week={week} perWeek={perWeek} weekKey={weekKey()} align="end" />
            <span className={cn('text-[14px] tabular-nums', week >= perWeek && 'text-good')}>本周 {week} / {perWeek}</span>
          </div>
        )}
      </header>

      <section aria-label="今天的推荐" className="mt-14">
        {resume ? <Resume session={resume} /> : question && offer ? (
          <>
            <Reason>{reason}</Reason>
            <Question>{question.text}</Question>
            <Meta items={[topicLabels[question.primaryTopic] ?? question.primaryTopic, typeName, `约 ${offer.kind === 'new' && offer.activity === 'quick' ? CARD_MINUTES : ESSAY_MINUTES} 分钟`]} />
            <div className="mt-8 flex flex-wrap items-center gap-2">
              {offer.kind === 'rewrite'
                ? <StartPractice size="lg" questionId={offer.questionId} activity="deep" rewriteOfDeepId={offer.rewriteOfDeepId}>同题重写</StartPractice>
                : <StartPractice size="lg" questionId={offer.questionId} activity={offer.activity} continueFromQuickId={offer.continueFromQuickId} explicitNew={offer.needsExplicitNew}>{offer.needsExplicitNew ? '另开一篇作文' : offer.continueFromQuickId ? '用卡片写成作文' : offer.activity === 'quick' ? '开始卡片' : '开始写作'}</StartPractice>}
              {alternative && <StartPractice size="lg" variant="ghost" className="text-muted-foreground" questionId={offer.questionId} activity={alternative.activity}>{alternative.label}</StartPractice>}
              <Link href="/practice" className={ghostPill}>换一个</Link>
            </div>
          </>
        ) : (
          <>
            <Reason>{pick?.kind === 'resume' ? '这个主题还有没写完的练习' : '选一个主题开始'}</Reason>
            <p className="mt-4 max-w-[22em] text-[28px] leading-[1.3] font-semibold tracking-tight sm:text-[34px]">{quickEnabled ? '卡片理清想法，作文写成一篇。' : '从思路写到完整作文。'}</p>
            <div className="mt-8 flex flex-wrap items-center gap-2">
              {pick?.kind === 'resume'
                ? <Link href={`/essays/${pick.attemptId}`} className={solidPill}>继续练习</Link>
                : <Link href="/practice" className={solidPill}>去选题</Link>}
            </div>
          </>
        )}
      </section>

      <div className="mt-16 grid gap-12 xl:grid-cols-[minmax(0,1fr)_15rem] xl:gap-14 lg:grid-cols-[minmax(0,1fr)_13rem] lg:gap-10">
        <ol aria-label="学习情况" className="border-t border-foreground">
          {rows.map((row, index) => <li key={index} className="border-b">{row}</li>)}
        </ol>
        <PracticeHeatmap times={activity} />
      </div>
    </div>
  );
}

function Reason({ children }: { children: React.ReactNode }) {
  return <p className="flex items-center gap-2 text-[15px] text-muted-foreground"><span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />{children}</p>;
}

// Long questions step down a size so the whole question stays readable without clamping.
function Question({ children }: { children: string }) {
  const long = children.length > 150;
  return <h1 className={cn('mt-4 max-w-[30em] font-serif leading-[1.3] font-medium tracking-[-0.01em] text-pretty', long ? 'text-[24px] sm:text-[32px] sm:leading-[1.28]' : 'text-[28px] sm:text-[40px] sm:leading-[1.22]')}>{children}</h1>;
}

function Meta({ items }: { items: string[] }) {
  return <p className="mt-5 text-[15px] text-muted-foreground">{items.filter(Boolean).map((item, i) => <span key={item}>{i > 0 && <span className="mx-2 text-faint">·</span>}{item}</span>)}</p>;
}

type Session = ReturnType<typeof listSessions>[number];

function Resume({ session }: { session: Session }) {
  const quick = session.activity === 'quick';
  const kind = session.stage === 'revising' && session.drafts.revision ? 'revision' : 'original';
  const words = countWords(session.drafts[kind] ?? '');
  const topic = session.question?.primaryTopic;
  const type = session.question?.questionType;
  const { statusLabel } = libraryEntryState(session, false);
  const label = quick ? '卡片' : session.mode === 'mock' ? '模考' : '作文';
  return (
    <>
      <Reason>接着上次的{label}</Reason>
      <Question>{session.prompt.text}</Question>
      <Meta items={[topic ? topicLabels[topic] ?? topic : '', type ? questionTypeLabels[type] ?? type : '', !quick && words > 0 ? `${statusLabel} · 已写 ${words} 词` : statusLabel]} />
      <div className="mt-8 flex flex-wrap items-center gap-2">
        <Link href={`/essays/${session.id}`} className={solidPill}>{quick ? '继续写卡片' : words ? '继续写作' : '开始写作'}</Link>
        <Link href="/practice" className={ghostPill}>换一个</Link>
      </div>
    </>
  );
}
