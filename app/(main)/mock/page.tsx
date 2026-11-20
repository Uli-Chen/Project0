import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckpointInvitation } from "@/components/checkpoints/checkpoint-invitation";
import { readFeatures } from "@/lib/config/features";
import { requireUser } from "@/lib/auth/server";
import { checkpointHistory } from "@/lib/db/checkpoints";
import { listSessions } from "@/lib/db/queries/sessions";
import { formatDate } from "@/lib/learning/summary";

export const metadata = { title: "模考" };

/** 模考: start an independent 40-minute mock, and see the ones already done. */
export default async function MockPage() {
  if (!readFeatures().CHECKPOINTS_ENABLED) notFound();
  const user = await requireUser();
  const sessions = listSessions(user.id);
  const done = checkpointHistory(user.id)
    .filter((c) => c.status === "eligible" && c.completedAt)
    .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))
    .flatMap((c) => {
      const session = sessions.find((s) => s.id === c.attemptId);
      return session?.evaluation ? [{ id: session.id, at: c.completedAt!, text: session.prompt.text, score: session.evaluation.scores.overall }] : [];
    });

  return (
    <div className="flex flex-col gap-10">
      <header className="flex items-end justify-between gap-4">
        <h1 className="page-heading">模考</h1>
        {user.profile.target && <p className="text-[15px] text-muted-foreground">目标 <b className="font-semibold text-foreground tabular-nums">{user.profile.target}</b></p>}
      </header>
      <CheckpointInvitation onDemand />
      {done.length > 0 && (
        <section>
          <h2 className="section-heading">做过的模考</h2>
          <ol className="mt-4 border-t border-foreground">
            {done.map((mock) => (
              <li key={mock.id} className="border-b">
                <Link href={`/essays/${mock.id}`} className="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-baseline gap-4 py-4 transition-colors hover:bg-sunk/60">
                  <span className="text-[15px] text-muted-foreground tabular-nums">{formatDate(mock.at)}</span>
                  <span className="truncate font-serif text-[16px]">{mock.text}</span>
                  <span className="text-[22px] font-semibold tabular-nums">{mock.score.toFixed(1)}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
