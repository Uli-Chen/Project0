import { questionTypeLabels, topicLabels } from '@/lib/question-bank/labels';
import Link from 'next/link';
import { Clock } from 'lucide-react';
import type { CurrentUser } from '@/lib/auth/types';
import { getTopicData } from '@/lib/db/queries/topics';
import { listSessions } from '@/lib/db/queries/sessions';
import { libraryEntryState } from '@/lib/learning/library';
import { examTime, learningSummary } from '@/lib/learning/summary';
import { fixedIssues } from '@/lib/learning/fixes';
import { countWords } from '@/lib/rules/text';
import { StartPractice } from '@/components/topics/start-practice';
import { Tile, Big } from '@/components/topics/home-row';
import { PracticeHeatmap } from '@/components/topics/practice-heatmap';
import { WeekPips } from '@/components/topics/week-pips';
import { buttonVariants } from '@/components/ui/button';
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
// The quiet action sits on the grey panel, so its hover is a tint of ink rather than the panel's own grey.
const ghostPill = 'inline-flex h-11 items-center rounded-full px-4 text-[15px] text-muted-foreground transition-colors duration-(--dur-fast) hover:bg-foreground/[0.06] hover:text-foreground';
const solidPill = buttonVariants({ size: 'lg' });

/** 今天: one recommended practice led by its question on a grey panel, then tiles for where the learner stands. */
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

  // Always the same four tiles, so a new learner sees what will fill up. Only the first one leads somewhere.
  const tiles = [
    <Tile key="new" label="新的练习" href="/practice"><span className="text-[17px] leading-snug font-medium">全部主题和题目</span></Tile>,
    <Tile key="done" label="已完成"><span className="flex flex-wrap items-baseline gap-x-5 gap-y-1"><Big value={essays} unit="篇作文" /><Big value={cards} unit="张卡片" /></span></Tile>,
    <Tile key="focus" label="这次留意"><span className={cn('line-clamp-2 text-[17px] leading-snug font-medium', !focus && 'text-muted-foreground')}>{focus ? focus.title : '—'}</span></Tile>,
    <Tile key="fixed" label="改好的问题"><Big value={fixed.length} unit="个" tone={fixed.length ? 'good' : undefined} note={fixed[0] ? `最近：${fixed[0].title}` : undefined} /></Tile>,
  ];
  // Days with practice: a practice started, last worked on or completed.
  const activity = [...data.attempts.flatMap((a) => [a.createdAt, a.lastStudentActionAt]), ...data.completions.map((c) => c.completedAt)];

  return (
    <div className="flex flex-col">
      <header className="motion-enter flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-[15px] text-muted-foreground" style={{ "--i": 0 } as React.CSSProperties}>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>{today}</span>
          {!profile.onboardingCompleted
            ? <Link href="/onboarding" className="text-foreground underline underline-offset-4">设置目标</Link>
            : time.examPassed ? <span className="text-warn">考试日期已过</span>
            : time.countsDown ? <span>距考试 <b className="font-semibold text-foreground tabular-nums">{time.weeks}</b> 周</span>
            : <span>{time.timeLeft}</span>}
        </p>
        {perWeek > 0 && (
          <div className="flex items-center gap-3">
            <WeekPips week={week} perWeek={perWeek} weekKey={weekKey()} align="end" />
            <span className={cn('text-[14px] tabular-nums', week >= perWeek && 'text-good')}>本周 {week} / {perWeek}</span>
          </div>
        )}
      </header>

      <section aria-label="今天的推荐" className="lead motion-enter mt-6 px-6 py-8 sm:px-10 sm:py-10" style={{ "--i": 1 } as React.CSSProperties}>
        {resume ? <Resume session={resume} /> : question && offer ? (
          <>
            <Reason>{reason}</Reason>
            <Question>{question.text}</Question>
            <Meta topic={question.primaryTopic} type={typeName} minutes={offer.kind === 'new' && offer.activity === 'quick' ? CARD_MINUTES : ESSAY_MINUTES} />
            <div className="mt-7 flex flex-wrap items-center gap-2">
              {offer.kind === 'rewrite'
                ? <StartPractice size="lg" questionId={offer.questionId} activity="deep" rewriteOfDeepId={offer.rewriteOfDeepId}>同题重写</StartPractice>
                : <StartPractice size="lg" questionId={offer.questionId} activity={offer.activity} continueFromQuickId={offer.continueFromQuickId} explicitNew={offer.needsExplicitNew}>{offer.needsExplicitNew ? '另开一篇作文' : offer.continueFromQuickId ? '用卡片写成作文' : offer.activity === 'quick' ? '开始卡片' : '开始写作'}</StartPractice>}
              {alternative && <StartPractice size="lg" variant="outline" questionId={offer.questionId} activity={alternative.activity}>{alternative.label}</StartPractice>}
              <Link href="/practice" className={ghostPill}>换一个</Link>
            </div>
          </>
        ) : (
          <>
            <Reason>{pick?.kind === 'resume' ? '这个主题还有没写完的练习' : '选一个主题开始'}</Reason>
            <p className="mt-4 max-w-[22em] text-[28px] leading-[1.3] font-semibold tracking-tight sm:text-[34px]">{quickEnabled ? '卡片理清想法，作文写成一篇。' : '从思路写到完整作文。'}</p>
            <div className="mt-7 flex flex-wrap items-center gap-2">
              {pick?.kind === 'resume'
                ? <Link href={`/essays/${pick.attemptId}`} className={solidPill}>继续练习</Link>
                : <Link href="/practice" className={solidPill}>去选题</Link>}
            </div>
          </>
        )}
      </section>

      <div className="mt-3.5 grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <ul aria-label="学习情况" className="motion-stagger grid gap-3.5 sm:grid-cols-2">
          {tiles.map((item, index) => <li key={index} className="min-w-0">{item}</li>)}
        </ul>
        <div className="motion-enter min-w-0" style={{ "--i": 2 } as React.CSSProperties}><PracticeHeatmap times={activity} /></div>
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
  return <h1 className={cn('mt-3.5 max-w-[30em] font-serif leading-[1.3] font-medium tracking-[-0.01em] text-pretty', long ? 'text-[22px] sm:text-[28px] sm:leading-[1.3]' : 'text-[26px] sm:text-[34px] sm:leading-[1.25]')}>{children}</h1>;
}

/** What the question is and where it stands, each fact in its own form: the topic on its hue, the type as text, progress behind a dot, time behind a clock. */
function Meta({ topic, type, progress = [], note, minutes }: { topic?: string; type?: string; progress?: string[]; note?: string; minutes?: number }) {
  return (
    <ul aria-label="题目信息" className="mt-4 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[14px] text-muted-foreground">
      {topic && <li className="topic-tag" data-topic={topic}>{topicLabels[topic] ?? topic}</li>}
      {type && <li>{type}</li>}
      {progress.map((part, i) => i === 0
        ? <li key={part} className="flex items-center gap-1.5 font-medium text-warn"><span className="size-1.5 rounded-full bg-current" aria-hidden />{part}</li>
        : <li key={part}>{part}</li>)}
      {note && <li className="tabular-nums">{note}</li>}
      {minutes && <li className="flex items-center gap-1 tabular-nums"><Clock className="size-3.5 text-faint" aria-hidden />约 {minutes} 分钟</li>}
    </ul>
  );
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
      <Meta topic={topic} type={type ? questionTypeLabels[type] ?? type : undefined} progress={statusLabel.split(' · ')} note={!quick && words > 0 ? `已写 ${words} 词` : undefined} />
      <div className="mt-7 flex flex-wrap items-center gap-2">
        <Link href={`/essays/${session.id}`} className={solidPill}>{quick ? '继续写卡片' : words ? '继续写作' : '开始写作'}</Link>
        <Link href="/practice" className={ghostPill}>换一个</Link>
      </div>
    </>
  );
}
