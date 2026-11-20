import Link from "next/link";
import { notFound } from "next/navigation";
import { readFeatures } from "@/lib/config/features";
import { requireUser } from "@/lib/auth/server";
import { checkpointHistory, getCheckpointState } from "@/lib/db/checkpoints";
import { listSessions } from "@/lib/db/queries/sessions";
import { checkpointScorePoints } from "@/lib/learning/checkpoints";
import { formatDate } from "@/lib/learning/summary";
import type { Dim } from "@/lib/prototype/types";
import { MockScoreChart } from "@/components/pages/progress-charts";
import { StartMock } from "@/components/checkpoints/start-mock";
import { cn } from "@/lib/utils";

export const metadata = { title: "模考" };
// The score card module is a client component; a server page keeps its own copy of the band labels.
const DIMS: Dim[] = ["TR", "CC", "LR", "GRA"];
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

  return (
    <div className="flex flex-col">
      <header className="flex items-end justify-between gap-4">
        <h1 className="page-heading">模考</h1>
        {target !== null && <p className="text-[15px] text-muted-foreground">目标 <b className="font-semibold text-foreground tabular-nums">{target.toFixed(1)}</b></p>}
      </header>

      <section aria-label="开始模考" className="mt-10">
        <p className="mb-5 max-w-[34em] text-[17px] leading-relaxed">40 分钟写一道你没练过的题，没有教练。{points.length ? "分数会加入下面的趋势。" : "看看你现在的水平。"}</p>
        <StartMock state={state.state} attemptId={"attemptId" in state ? state.attemptId : undefined} />
      </section>

      {points.length > 0 && latest && (
        <>
          <section aria-label="模考成绩" className="mt-14 grid grid-cols-2 border-y sm:grid-cols-4">
            <Stat label="模考" value={String(points.length)} unit="次" />
            <Stat label="最近一次" value={latest.overall.toFixed(1)} />
            <Stat label="最高" value={best!.toFixed(1)} />
            <Stat label="比第一次" value={points.length > 1 ? signed(latest.overall - first.overall) : "—"} tone={points.length > 1 ? latest.overall - first.overall : 0} />
          </section>

          <section className="mt-12 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="surface p-6">
              <h2 className="mb-4 text-[15px] font-semibold">分数趋势</h2>
              <MockScoreChart points={points} target={target ?? undefined} />
            </div>
            <div className="surface p-6">
              <h2 className="text-[15px] font-semibold">四项分</h2>
              <ul className="mt-4 flex flex-col gap-3">
                {DIMS.map((dim) => {
                  const change = previous ? latest.dims[dim] - previous.dims[dim] : 0;
                  return (
                    <li key={dim} className="flex items-baseline justify-between gap-3">
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
            <section className="mt-12">
              <h2 className="section-heading">模考里反复出现的问题</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {recurring.map((issue) => (
                  <li key={issue.title} className="surface flex items-baseline justify-between gap-4 px-5 py-4">
                    <span className="text-[16px]">{issue.title}</span>
                    <span className="shrink-0 text-[14px] text-muted-foreground tabular-nums">{counted.length} 次模考里出现 <b className={cn("font-semibold", issue.count > 1 ? "text-warn" : "text-foreground")}>{issue.count}</b> 次</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {(counted.length > 0 || others.length > 0) && (
        <section className="mt-12">
          <h2 className="section-heading">做过的模考</h2>
          <ol className="mt-4 flex flex-col gap-3">
            {[...counted.map(({ session, at }) => ({ session, at, note: null as string | null })), ...others.map((session) => ({ session, at: session.completedAt ?? session.createdAt, note: otherMockReason(history.find((c) => c.attemptId === session.id)?.reason) }))]
              .sort((a, b) => b.at.localeCompare(a.at))
              .map(({ session, at, note }) => (
                <li key={session.id}>
                  <Link href={`/essays/${session.id}`} className="surface grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-baseline gap-4 px-5 py-4 transition-shadow hover:shadow-[0_0_0_1px_var(--faint)]">
                    <span className="text-[14px] text-muted-foreground tabular-nums">{formatDate(at)}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-serif text-[16px]">{session.prompt.text}</span>
                      {note && <span className="mt-1 inline-block rounded-md bg-sunk px-2 py-0.5 text-[14px] text-muted-foreground">不计入成绩 · {note}</span>}
                    </span>
                    <span className="text-[20px] font-semibold tabular-nums">{session.evaluation!.scores.overall.toFixed(1)}</span>
                  </Link>
                </li>
              ))}
          </ol>
        </section>
      )}
    </div>
  );
}

const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

function Stat({ label, value, unit, tone = 0 }: { label: string; value: string; unit?: string; tone?: number }) {
  return (
    <div className="py-5 pr-4 [&:nth-child(n+2)]:border-l [&:nth-child(n+2)]:pl-5 max-sm:[&:nth-child(3)]:border-l-0 max-sm:[&:nth-child(3)]:pl-0 max-sm:[&:nth-child(n+3)]:border-t">
      <p className="text-[14px] text-muted-foreground">{label}</p>
      <p className={cn("mt-1.5 text-[32px] leading-none font-semibold tracking-[-0.03em] tabular-nums", tone > 0 && "text-good", tone < 0 && "text-warn")}>{value}{unit && <span className="ml-1.5 text-[15px] font-normal tracking-normal text-muted-foreground">{unit}</span>}</p>
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
