import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { readFeatures } from "@/lib/config/features";
import { requireUser } from "@/lib/auth/server";
import { getTopicData } from "@/lib/db/queries/topics";
import { formatDate } from "@/lib/learning/summary";
import { NewEssayDialog } from "@/components/shell/new-essay";
import { TypeDots } from "@/components/topics/topic-picker";
import { topicChoices } from "@/components/topics/topic-choices";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "练习" };

/** 练习: every topic with its progress, and practising with the learner's own question. */
export default async function PracticePage() {
  const features = readFeatures();
  if (!features.QUESTION_BANK_ENABLED) notFound();
  const user = await requireUser();
  const data = getTopicData(user.id);
  const topics = topicChoices(data, data.lastTopic ?? null);

  return (
    <div className="flex flex-col">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="page-heading">练习</h1>
        <NewEssayDialog pasteOnly trigger={<button type="button" className={buttonVariants({ variant: "outline" })}>用自己的题</button>} />
      </header>

      <ol aria-label="全部主题" className="mt-10 border-t border-foreground">
        {topics.map((t) => (
          <li key={t.topic} className="border-b">
            <Link href={`/topics/${encodeURIComponent(t.topic)}`} className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 py-5 sm:grid-cols-[9rem_8rem_minmax(0,1fr)_6rem_1.25rem]">
              <span className="flex items-center gap-2">
                <span className="text-[18px] font-semibold tracking-tight">{t.label}</span>
                {t.current && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[13px] text-primary">上次练到这里</span>}
              </span>
              <span className="flex items-center gap-2 text-[14px] text-muted-foreground tabular-nums max-sm:hidden"><TypeDots types={t.types} typeCount={t.typeCount} />{t.types}/{t.typeCount} 题型</span>
              <span className="text-[15px] tabular-nums max-sm:col-start-1 max-sm:row-start-2">
                {t.completed || t.startedOnly ? `完成 ${t.completed}/${t.total} 题` : `${t.total} 道题`}
                {quickCard(t.cards, features.QUICK_ENABLED)}
              </span>
              <span className="text-right text-[14px] text-muted-foreground tabular-nums max-sm:hidden">{t.lastPractisedAt ? formatDate(t.lastPractisedAt) : "—"}</span>
              <ArrowUpRight className={cn("size-4 justify-self-end text-muted-foreground transition-colors group-hover:text-foreground", "max-sm:row-span-2 max-sm:col-start-2 max-sm:row-start-1")} aria-hidden />
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

function quickCard(cards: number, quickEnabled: boolean) {
  return quickEnabled && cards > 0 ? <span className="text-muted-foreground"> · {cards} 张卡片</span> : null;
}
