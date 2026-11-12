import { AttemptHistory } from "@/components/topics/attempt-history";
import { topicLabels, questionTypeLabels } from '@/lib/question-bank/labels';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readFeatures } from '@/lib/config/features';
import { requireUser } from '@/lib/auth/server';
import { getTopicData } from '@/lib/db/queries/topics';
import { StartPractice } from '@/components/topics/start-practice';
import { RecommendationReason } from '@/components/topics/reason';
import { buttonVariants } from '@/components/ui/button';

export default async function TopicPage({ params }: { params: Promise<{ topic: string }> }) {
  const user = await requireUser();
  const flags = readFeatures();
  if (!flags.QUESTION_BANK_ENABLED) notFound();
  const { topic } = await params;
  const data = getTopicData(user.id, topic);
  if (!data.questions.length) notFound();
  const r = data.recommendation!;
  const done = new Set(data.completions.filter(c => c.activity === 'deep').map(c => c.questionId));
  return (
    <div className="flex flex-col">
      <Link href="/" className="-ml-2 inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-[15px] text-muted-foreground hover:bg-sunk hover:text-foreground"><ChevronLeft className="size-4" />全部主题</Link>
      <h1 className="page-heading mt-4">{topicLabels[topic] ?? topic}</h1>

      <section aria-label="下一次练习" className="lead mt-8 flex flex-col gap-4 px-7 py-8 sm:px-10">
        <h2 className="text-[15px] font-medium text-muted-foreground">下一次练习</h2>
        {r.kind === 'resume' ? <div><Link href={`/essays/${r.attemptId}`} className={buttonVariants({ size: 'lg' })}>继续没写完的练习</Link></div>
          : r.kind === 'empty' ? <p className="text-muted-foreground">{r.reason === 'no_practice_questions' ? '这个主题暂时没有练习题。' : '这个主题的题目都在进行中或已暂放，可以从下面继续，或换一个主题。'}</p>
          : <>
            <p className="max-w-[32em] font-serif text-[25px] leading-[1.4] text-pretty">{data.questions.find(q => q.id === r.questionId)?.text}</p>
            <RecommendationReason reason={r.reason} />
            {r.kind === 'rewrite' && <p className="text-[15px] text-muted-foreground">{r.sourceDeleted ? '原作文已删除，将从空白开始同题重写。' : '同题重写会保留原来的完成记录。'}</p>}
            <div className="pt-2">{r.kind === 'rewrite'
              ? <StartPractice size="lg" questionId={r.questionId} activity="deep" rewriteOfDeepId={r.rewriteOfDeepId}>同题重写</StartPractice>
              : <StartPractice size="lg" questionId={r.questionId} activity={r.activity} continueFromQuickId={r.continueFromQuickId} explicitNew={r.needsExplicitNew}>{r.needsExplicitNew ? '另开一次精练' : r.continueFromQuickId ? '用卡片写成作文' : r.activity === 'quick' ? '开始速刷' : '开始精练'}</StartPractice>}</div>
          </>}
      </section>

      <section className="mt-16">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="section-heading">全部题目</h2>
          <span className="text-[15px] text-muted-foreground tabular-nums">{data.questions.length} 道，练习题，不是官方真题</span>
        </div>
        <ol className="mt-6 flex flex-col">
          {data.questions.map(q => {
            const history = data.attempts.filter(a => a.questionId === q.id);
            return (
              <li key={q.id} className="grid gap-x-10 gap-y-4 border-t py-7 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <p className="text-[15px] text-muted-foreground">{questionTypeLabels[q.questionType] ?? q.questionType}{done.has(q.id) && <span className="ml-3 font-medium text-good">已完成精练</span>}{q.pool === 'checkpoint_reserved' && <span className="ml-3 font-medium text-primary">留作模考</span>}</p>
                  <p className="mt-2 max-w-[40em] font-serif text-[19px] leading-[1.6]">{q.text}</p>
                  {q.pool === 'checkpoint_reserved' && <p className="mt-2 text-[15px] text-muted-foreground">这道题留给 40 分钟的检查点模考。现在练了，它就不会再用来模考。</p>}
                  {history.length > 0 && (
                    <details className="mt-3">
                      <summary className="w-fit cursor-pointer text-[15px] text-muted-foreground hover:text-foreground">练过 {history.length} 次</summary>
                      <div className="mt-3 rounded-xl bg-sunk px-5 py-4"><AttemptHistory attempts={history} completions={data.completions} /></div>
                    </details>
                  )}
                </div>
                <div className="flex gap-2 md:pt-7">
                  {flags.QUICK_ENABLED && <StartPractice variant="outline" questionId={q.id} activity="quick">速刷</StartPractice>}
                  <StartPractice variant="outline" questionId={q.id} activity="deep">精练</StartPractice>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
