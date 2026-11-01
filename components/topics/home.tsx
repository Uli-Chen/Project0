import { topicLabels } from '@/lib/question-bank/labels';
import Link from 'next/link';
import { getTopicData } from '@/lib/db/queries/topics';
import { formatDate } from '@/lib/learning/summary';
import { CheckpointInvitation } from '@/components/checkpoints/checkpoint-invitation';
export function TopicHome({userId, onboardingCompleted, quickEnabled}:{userId:string; onboardingCompleted:boolean; quickEnabled:boolean}) {
 const data=getTopicData(userId);
 return <div className="space-y-8"><header><h1 className="page-heading">练习</h1><p className="meta mt-3">本周完成 {data.counts.weekCompleted} 次{data.counts.unknownDate > 0 && <> · 历史日期未知 {data.counts.unknownDate} 次</>}</p></header>
 {data.resume&&<Link className="block rounded-xl border bg-sheet p-5" href={`/essays/${data.resume.id}`}>继续上次练习 →</Link>}
 <CheckpointInvitation />
 {!onboardingCompleted && <section aria-label="开始练习" className="rounded-xl border bg-sheet p-5 space-y-3">
   <h2 className="font-serif text-xl">按自己的节奏开始</h2>
   <p className="text-sm text-muted-foreground">{quickEnabled ? "速刷：用卡片整理想法，不用写整篇。精练：从思路到完整作文，获得写作反馈。" : "精练：从思路到完整作文，获得写作反馈。"}</p>
   <p className="text-sm text-muted-foreground">可以先设置目标分数和练习节奏，也可以直接选题。</p>
   <div className="flex flex-wrap gap-4 text-sm"><Link href="/onboarding" className="font-medium underline underline-offset-4">设置目标与节奏</Link><Link href="#topics" className="text-muted-foreground underline underline-offset-4">先去选题</Link></div>
 </section>}
 <section id="topics" className="scroll-mt-8 space-y-4"><div><h2 className="font-serif text-xl">选择主题</h2><p className="meta mt-1">先选主题，再选题目开始练习。</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.topics.map(t=><Link key={t.topic} href={`/topics/${encodeURIComponent(t.topic)}`} className="rounded-xl border bg-sheet p-5 hover:border-foreground"><h2 className="font-serif text-xl">{topicLabels[t.topic] ?? t.topic}</h2><p className="meta mt-3">已完成 {t.completed} 题 · 只开始过 {t.startedOnly} 题</p><p className="meta">通过卡片 {t.passedCards} · 草稿与待复查 {t.draftCards}</p><p className="meta mt-2">{t.lastPractisedAt?formatDate(t.lastPractisedAt):'还没练过'}</p></Link>)}</div></section>
 {data.lastTopic&&<Link className="text-sm underline" href={`/topics/${encodeURIComponent(data.lastTopic)}`}>返回上次主题：{topicLabels[data.lastTopic] ?? data.lastTopic}</Link>}
 </div>;
}
