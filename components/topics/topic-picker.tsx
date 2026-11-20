"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { NewEssayDialog } from "@/components/shell/new-essay";

export type TopicChoice = { topic: string; label: string; completed: number; total: number; startedOnly: number; cards: number; lastPractisedAt: string | null; types: number; typeCount: number; current: boolean };

/** "换一个": every topic with its progress; a topic opens its own page, where the learner picks a question. */
/** ownQuestion adds a way to practise with the learner's own question, outside the bank. */
export function TopicPicker({ topics, ownQuestion = false, className, children }: { topics: TopicChoice[]; ownQuestion?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <Sheet>
      <SheetTrigger render={<button type="button" className={className} />}>{children}</SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-sm">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle className="text-lg font-semibold">换一个主题</SheetTitle>
        </SheetHeader>
        <ul className="flex flex-col overflow-y-auto px-3 py-2">
          {topics.map((t) => (
            <li key={t.topic}>
              <Link href={`/topics/${encodeURIComponent(t.topic)}`} className="group flex items-center justify-between gap-3 rounded-xl px-3 py-3.5 transition-colors hover:bg-sunk">
                <span className="min-w-0">
                  <span className={cn("block text-[16px] font-medium", t.current && "text-primary")}>{t.label}{t.current && <span className="ml-2 text-[14px] font-normal">当前</span>}</span>
                  <span className="mt-1.5 flex items-center gap-3 text-[14px] text-muted-foreground tabular-nums">
                    <TypeDots types={t.types} typeCount={t.typeCount} />
                    {t.completed} / {t.total} 题
                  </span>
                </span>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        {ownQuestion && (
          <div className="mt-auto border-t px-6 py-5">
            <NewEssayDialog pasteOnly trigger={<button type="button" className="text-[15px] font-medium underline-offset-4 hover:underline">用自己的题</button>} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** One dot per question type; filled for the types practised in this topic. */
export function TypeDots({ types, typeCount }: { types: number; typeCount: number }) {
  return (
    <span className="flex gap-1" role="img" aria-label={`练过 ${types} / ${typeCount} 种题型`}>
      {Array.from({ length: typeCount }, (_, i) => <span key={i} className={cn("size-1.5 rounded-full", i < types ? "bg-foreground" : "bg-border")} />)}
    </span>
  );
}
