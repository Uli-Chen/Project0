import { AttemptHistory } from "@/components/topics/attempt-history";
import { topicLabels, questionTypeLabels } from '@/lib/question-bank/labels';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readFeatures } from '@/lib/config/features';
import { requireUser } from '@/lib/auth/server';
import { getTopicData } from '@/lib/db/queries/topics';
import { StartPractice } from '@/components/topics/start-practice';
import { RecommendationReason } from '@/components/topics/reason';
export default async function TopicPage({params}:{params:Promise<{topic:string}>}){
 const user=await requireUser(); const flags=readFeatures();if(!flags.QUESTION_BANK_ENABLED)notFound();
 const {topic}=await params;const data=getTopicData(user.id,topic);if(!data.questions.length)notFound(); const r=data.recommendation!;
 return <div className="space-y-8"><Link href="/" className="meta">← 所有主题</Link><h1 className="page-heading">{topicLabels[topic] ?? topic}</h1><section className="rounded-xl border bg-sheet p-5 space-y-3"><h2 className="font-medium">下一次练习</h2>
 {r.kind==='resume'?<Link href={`/essays/${r.attemptId}`} className="underline">继续未完成练习</Link>:r.kind==='empty'?<p>{r.reason==='no_practice_questions'?'这个主题暂无普通练习题。':'请查看已暂放的练习，或选择其他主题。'}</p>:<><p>{data.questions.find(q=>q.id===r.questionId)?.text}</p><RecommendationReason reason={r.reason}/>{r.kind==='rewrite'?<><p className="meta">{r.sourceDeleted?'原作文已删除，将从空白开始同题重写。':'同题重写保留原有完成记录。'}</p><StartPractice questionId={r.questionId} activity="deep" rewriteOfDeepId={r.rewriteOfDeepId}>同题重写</StartPractice></>:<StartPractice questionId={r.questionId} activity={r.activity} continueFromQuickId={r.continueFromQuickId} explicitNew={r.needsExplicitNew}>{r.needsExplicitNew?'明确另开一次精练':r.continueFromQuickId?'用卡片写成作文':r.activity==='quick'?'开始速刷':'开始精练'}</StartPractice>}</>}
 </section><section className="space-y-4"><h2 className="font-serif text-xl">全部题目</h2>{data.questions.map(q=><article key={q.id} className="rounded-xl border p-5 space-y-3"><p className="meta">练习题（非官方真题） · {questionTypeLabels[q.questionType] ?? q.questionType}{q.pool==='checkpoint_reserved'?' · 检查点保留题':''}</p><p>{q.text}</p>{q.pool==='checkpoint_reserved'&&<p className="text-sm text-muted-foreground">提前练习会使用这道题的检查点资格。</p>}<div className="flex flex-wrap gap-3">{flags.QUICK_ENABLED&&<StartPractice questionId={q.id} activity="quick">速刷</StartPractice>}<StartPractice questionId={q.id} activity="deep">精练</StartPractice></div><AttemptHistory attempts={data.attempts.filter(a=>a.questionId===q.id)} completions={data.completions} /></article>)}</section></div>;
}
