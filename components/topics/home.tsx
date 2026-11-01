import { topicLabels } from '@/lib/question-bank/labels';
import Link from 'next/link';
import { getTopicData } from '@/lib/db/queries/topics';
import { formatDate } from '@/lib/learning/summary';
import { CheckpointInvitation } from '@/components/checkpoints/checkpoint-invitation';
export function TopicHome({userId}:{userId:string}) {
 const data=getTopicData(userId);
 return <div className="space-y-8"><header><h1 className="page-heading">练习</h1><p className="meta mt-3">本周完成 {data.counts.weekCompleted} 次 · 历史日期未知 {data.counts.unknownDate} 次</p></header>
 {data.resume&&<Link className="block rounded-xl border bg-sheet p-5" href={`/essays/${data.resume.id}`}>继续上次练习 →</Link>}
 <CheckpointInvitation />
 <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.topics.map(t=><Link key={t.topic} href={`/topics/${encodeURIComponent(t.topic)}`} className="rounded-xl border bg-sheet p-5 hover:border-foreground"><h2 className="font-serif text-xl">{topicLabels[t.topic] ?? t.topic}</h2><p className="meta mt-3">已完成 {t.completed} 题 · 只开始过 {t.startedOnly} 题</p><p className="meta">通过卡片 {t.passedCards} · 草稿与待复查 {t.draftCards}</p><p className="meta mt-2">{t.lastPractisedAt?formatDate(t.lastPractisedAt):'还没练过'}</p></Link>)}</section>
 {data.lastTopic&&<Link className="text-sm underline" href={`/topics/${encodeURIComponent(data.lastTopic)}`}>返回上次主题：{topicLabels[data.lastTopic] ?? data.lastTopic}</Link>}
 </div>;
}
