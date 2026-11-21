import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { readFeatures } from "@/lib/config/features";
import { requireUser } from "@/lib/auth/server";
import { checkpointHistory, getCheckpointState } from "@/lib/db/checkpoints";
import { listSessions } from "@/lib/db/queries/sessions";
import { checkpointScorePoints } from "@/lib/learning/checkpoints";
import { formatDate } from "@/lib/learning/summary";
import type { Dim } from "@/lib/prototype/types";
import { MockScoreChart } from "@/components/pages/progress-charts";
import { StartMock } from "@/components/checkpoints/start-mock";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export const metadata = { title: "模考" };
// The score card module is a client component; a server page keeps its own copy of the band labels.
const DIMS: Dim[] = ["TR", "CC", "LR", "GRA"];
const PAST_SHOWN = 8;
const DIM_LABEL: Record<Dim, string> = { TR: "任务回应", CC: "连贯与衔接", LR: "词汇", GRA: "语法" };

/** 模考: one button into a 40-minute mock without the coach, and how the learner's unassisted writing is going. */
export default async function MockPage() {
  if (!readFeatures().CHECKPOINTS_ENABLED) notFound();
  const user = await requireUser();
  const sessions = listSessions(user.id);
  const history = checkpointHistory(user.id);
  const state = getCheckpointState(user.id);
  const target = user.profile.target ? Number(user.profile.target) : null;

  // Only on-time mocks without the coach count; they are in time order.
  const points = checkpointScorePoints(sessions, history);
  const counted = history.filter((c) => c.status === "eligible" && c.completedAt).sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))
    .flatMap((c) => { const session = sessions.find((s) => s.id === c.attemptId); return session?.evaluation ? [{ session, at: c.completedAt! }] : []; });
  const latest = points.at(-1), previous = points.at(-2), first = points[0];
  const best = points.length ? Math.max(...points.map((p) => p.overall)) : null;
  const qualified = new Set(history.filter((c) => c.status === "eligible").map((c) => c.attemptId));
  const others = sessions.filter((s) => s.mode === "mock" && s.evaluation && !qualified.has(s.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Problems that come back without the coach are the ones not yet learned.
  const recurring = [...counted.reduce((map, { session }) => {
    const seen = new Set<string>();
    for (const issue of session.evaluation!.issues) {
      const key = issue.code || issue.title;
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = map.get(key) ?? { title: issue.title, count: 0 };
      entry.count++;
      map.set(key, entry);
    }
    return map;
  }, new Map<string, { title: string; count: number }>()).values()].sort((a, b) => b.count - a.count).slice(0, 5);

  const enter = (i: number) => ({ "--i": i }) as CSSProperties;
  // Every mock so far, newest first; only the latest few are listed until asked for.
  const past = [...counted.map(({ session, at }) => ({ session, at, note: null as string | null })), ...others.map((session) => ({ session, at: session.completedAt ?? session.createdAt, note: otherMockReason(history.find((c) => c.attemptId === session.id)?.reason) }))]
              .sort((a, b) => b.at.localeCompare(a.at));
  const pastRow = ({ session, at, note }: (typeof past)[number]) => (
                <li key={session.id} className="border-b">
                  <Link href={`/essays/${session.id}`} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-baseline gap-4 py-3.5 transition-colors duration-(--dur-fast) hover:bg-sunk">
                    <span className="text-[14px] text-muted-foreground tabular-nums">{formatDate(at)}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-serif text-[16px]">{session.prompt.text}</span>
                      {note && <span className="mt-1 inline-block rounded-md border border-border bg-sheet px-2 py-0.5 text-[13px] text-muted-foreground">不计入成绩：{note}</span>}
                    </span>
                    <span className="text-[15px] font-medium tabular-nums">{session.evaluation!.scores.overall.toFixed(1)}</span>
                  </Link>
                </li>
  );

  return (
    <div className="flex flex-col">
      <header className="motion-enter flex items-end justify-between gap-4" style={enter(0)}>
        <h1 className="page-heading">模考</h1>
        {target !== null && <p className="text-[15px] text-muted-foreground">目标 <b className="font-semibold text-foreground tabular-nums">{target.toFixed(1)}</b></p>}
      </header>

      <section aria-label="开始模考" className="motion-enter mt-6" style={enter(1)}>
        <p className="mb-5 max-w-[34em] text-[16px] leading-relaxed text-muted-foreground">40 分钟写一道你没练过的题，没有教练。{points.length ? "分数会加入下面的趋势。" : "看看你现在的水平。"}</p>
        <StartMock state={state.state} attemptId={"attemptId" in state ? state.attemptId : undefined} />
      </section>

      {points.length > 0 && latest && (
        <>
          <section aria-label="模考成绩" className="motion-stagger mt-10 grid grid-cols-2 rounded-2xl bg-sunk px-6 sm:grid-cols-4">
            <Stat label="模考" value={String(points.length)} unit="次" />
            <Stat label="最近一次" value={latest.overall.toFixed(1)} />
            <Stat label="最高" value={best!.toFixed(1)} />
            <Stat label="比第一次" value={points.length > 1 ? signed(latest.overall - first.overall) : "—"} tone={points.length > 1 ? latest.overall - first.overall : 0} />
          </section>

          <section className="motion-enter mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]" style={enter(3)}>
            <div className="surface p-6">
              <h2 className="mb-4 text-[15px] font-semibold">分数趋势</h2>
              <MockScoreChart points={points} target={target ?? undefined} />
            </div>
            <div className="surface p-6">
              <h2 className="text-[15px] font-semibold">四项分</h2>
              <ul className="motion-stagger mt-4 flex flex-col divide-y">
                {DIMS.map((dim) => {
                  const change = previous ? latest.dims[dim] - previous.dims[dim] : 0;
                  return (
                    <li key={dim} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className="text-[15px] text-muted-foreground">{DIM_LABEL[dim]}</span>
                      <span className="flex items-baseline gap-2">
                        <b className="text-[22px] font-semibold tabular-nums">{latest.dims[dim].toFixed(1)}</b>
                        {previous && <span className={cn("w-10 text-right text-[14px] tabular-nums", change > 0 ? "text-good" : change < 0 ? "text-warn" : "text-muted-foreground")}>{change === 0 ? "—" : signed(change)}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          {recurring.length > 0 && (
            <section className="motion-enter mt-12" style={enter(4)}>
              <h2 className="section-heading">模考里反复出现的问题</h2>
              <ul className="motion-stagger mt-3 grid gap-x-10 border-t sm:grid-cols-2">
                {recurring.map((issue) => (
                  <li key={issue.title} className="flex items-baseline justify-between gap-4 border-b py-3.5">
                    <span className="text-[15px]">{issue.title}</span>
                    <span className="shrink-0 text-[14px] text-muted-foreground tabular-nums">{counted.length} 次模考里出现 <b className={cn("font-semibold", issue.count > 1 ? "text-warn" : "text-foreground")}>{issue.count}</b> 次</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {(counted.length > 0 || others.length > 0) && (
        <section className="motion-enter mt-12" style={enter(5)}>
          <h2 className="section-heading">做过的模考</h2>
          <ol className="motion-stagger mt-3 border-t">{past.slice(0, PAST_SHOWN).map(pastRow)}</ol>
          {past.length > PAST_SHOWN && (
            <Collapsible>
              <CollapsibleContent><ol>{past.slice(PAST_SHOWN).map(pastRow)}</ol></CollapsibleContent>
              <CollapsibleTrigger className="group mt-3 -ml-3 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[14px] text-muted-foreground transition-colors duration-(--dur-fast) hover:bg-sunk hover:text-foreground"><span className="group-data-panel-open:hidden">显示其余 {past.length - PAST_SHOWN} 次</span><span className="hidden group-data-panel-open:inline">收起</span><ChevronDown className="size-4 transition-transform duration-(--dur-layout) ease-(--ease-soft) group-data-panel-open:rotate-180" aria-hidden /></CollapsibleTrigger>
            </Collapsible>
          )}
        </section>
      )}
    </div>
  );
}

const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

function Stat({ label, value, unit, tone = 0 }: { label: string; value: string; unit?: string; tone?: number }) {
  return (
    <div className="py-5 pr-4 max-sm:even:border-l max-sm:even:pl-5 max-sm:[&:nth-child(n+3)]:border-t sm:[&:nth-child(n+2)]:border-l sm:[&:nth-child(n+2)]:pl-5">
      <p className="text-[14px] text-muted-foreground">{label}</p>
      <p className={cn("mt-1.5 text-[28px] leading-none font-semibold tracking-[-0.03em] tabular-nums", tone > 0 && "text-good", tone < 0 && "text-warn")}>{value}{unit && <span className="ml-1.5 text-[15px] font-normal tracking-normal text-muted-foreground">{unit}</span>}</p>
    </div>
  );
}

function otherMockReason(reason: string | null | undefined) {
  switch (reason) {
    case "外部练习声明不符合资格": return "你在别处练过这道题";
    case "开始时资格不符": return "开始时还不能算作独立模考";
    case "超过 40 分钟提交": return "超过 40 分钟才提交";
    case "原稿接受前使用了辅导": return "写作时用了教练帮助";
    default: return "普通模考";
  }
}
