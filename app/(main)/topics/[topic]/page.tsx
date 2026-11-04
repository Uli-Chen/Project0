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
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
export default async function TopicPage({params}:{params:Promise<{topic:string}>}){
 const user=await requireUser(); const flags=readFeatures();if(!flags.QUESTION_BANK_ENABLED)notFound();
 const {topic}=await params;const data=getTopicData(user.id,topic);if(!data.questions.length)notFound(); const r=data.recommendation!;
 return <div className="flex flex-col">
  <Link href="/" className="-ml-2 inline-flex w-fit items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-sunk hover:text-foreground"><ChevronLeft className="size-4" />所有主题</Link>
  <h1 className="page-heading mt-3">{topicLabels[topic] ?? topic}</h1>
  <section aria-label="下一次练习" className="lead mt-6 flex flex-col gap-3 py-6 pr-7 pl-8">
   <h2 className="text-sm font-semibold">下一次练习</h2>
   {r.kind==='resume'?<div><Link href={`/essays/${r.attemptId}`} className={buttonVariants()}>继续未完成练习</Link></div>
   :r.kind==='empty'?<p className="text-muted-foreground">{r.reason==='no_practice_questions'?'这个主题暂无普通练习题。':'请查看已暂放的练习，或选择其他主题。'}</p>
   :<><p className="max-w-[36em] font-serif text-[21px] leading-[1.45] text-pretty">{data.questions.find(q=>q.id===r.questionId)?.text}</p><RecommendationReason reason={r.reason}/>{r.kind==='rewrite'&&<p className="meta">{r.sourceDeleted?'原作文已删除，将从空白开始同题重写。':'同题重写保留原有完成记录。'}</p>}
     <div className="pt-2">{r.kind==='rewrite'?<StartPractice questionId={r.questionId} activity="deep" rewriteOfDeepId={r.rewriteOfDeepId}>同题重写</StartPractice>:<StartPractice questionId={r.questionId} activity={r.activity} continueFromQuickId={r.continueFromQuickId} explicitNew={r.needsExplicitNew}>{r.needsExplicitNew?'明确另开一次精练':r.continueFromQuickId?'用卡片写成作文':r.activity==='quick'?'开始速刷':'开始精练'}</StartPractice>}</div></>}
  </section>
  <section className="mt-10">
   <div className="mb-3 flex items-baseline justify-between gap-4"><h2 className="section-heading">全部题目</h2><span className="text-[13px] text-muted-foreground tabular-nums">共 {data.questions.length} 题</span></div>
   <ol className="surface flex flex-col divide-y overflow-hidden">{data.questions.map(q=>{const history=data.attempts.filter(a=>a.questionId===q.id);return <li key={q.id} className="flex flex-col gap-3 px-6 py-5">
    <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{questionTypeLabels[q.questionType] ?? q.questionType}</Badge>{q.pool==='checkpoint_reserved'&&<Badge variant="outline" className="border-coach-line bg-coach-soft text-coach">检查点保留题</Badge>}<span className="text-xs text-faint">练习题（非官方真题）</span></div>
    <p className="max-w-[46em] font-serif text-[17px] leading-relaxed">{q.text}</p>
    {q.pool==='checkpoint_reserved'&&<p className="text-sm text-muted-foreground">提前练习会使用这道题的检查点资格。</p>}
    <div className="flex flex-wrap gap-2.5">{flags.QUICK_ENABLED&&<StartPractice variant="outline" questionId={q.id} activity="quick">速刷</StartPractice>}<StartPractice variant="outline" questionId={q.id} activity="deep">精练</StartPractice></div>
    {history.length>0&&<div className="rounded-lg bg-sunk px-4 py-3 shadow-[inset_0_0_0_1px_var(--border)]"><AttemptHistory attempts={history} completions={data.completions} /></div>}
   </li>;})}</ol>
  </section>
 </div>;
}

