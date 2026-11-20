import Link from "next/link";
import { wordDiff, type DiffPart } from "@/lib/learning/word-diff";
import { cn } from "@/lib/utils";

export type FixDiffRow = { id: string; before: string; after: string | null; issueTitle: string; progress: string; mastered: boolean; sessionId: string; source: string };

/** 错句本 as a diff: the flagged sentence as the removed line, the checked fix as the added line,
 * with the changed words marked. Without a checked fix the added line says so. */
export function FixDiffList({ rows }: { rows: FixDiffRow[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => {
        const diff = row.after ? wordDiff(row.before, row.after) : null;
        return (
          <li key={row.id} className="overflow-hidden rounded-xl border bg-sheet">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-sunk/60 px-4 py-2.5">
              <ul className="flex flex-wrap gap-1.5" aria-label="标签">
                <li className="rounded-md bg-sheet px-2 py-0.5 text-[14px] shadow-[0_0_0_1px_var(--border)]">{row.issueTitle}</li>
                <li className={cn("rounded-md px-2 py-0.5 text-[14px]", row.mastered ? "bg-good-soft text-good" : "text-muted-foreground")}>{row.progress}</li>
              </ul>
              <Link href={`/essays/${row.sessionId}`} className="text-[14px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{row.source}</Link>
            </div>
            <div className="font-mono text-[14px] leading-[1.75]">
              <Line sign="-" tone="removed" parts={diff?.removed ?? [{ text: row.before, changed: false }]} />
              {diff
                ? <Line sign="+" tone="added" parts={diff.added} />
                : <div className="grid grid-cols-[2.25rem_minmax(0,1fr)]"><span className="py-2 text-center text-muted-foreground select-none" aria-hidden>+</span><span className="py-2 pr-4 font-sans text-[14px] text-muted-foreground">尚未改对</span></div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Line({ sign, tone, parts }: { sign: "-" | "+"; tone: "removed" | "added"; parts: DiffPart[] }) {
  const removed = tone === "removed";
  return (
    <div className={cn("grid grid-cols-[2.25rem_minmax(0,1fr)]", removed ? "bg-destructive/[0.06]" : "bg-good-soft/70")}>
      <span className={cn("py-2 text-center select-none", removed ? "text-destructive/70" : "text-good")} aria-hidden>{sign}</span>
      <span className="py-2 pr-4 break-words whitespace-pre-wrap">
        <span className="sr-only">{removed ? "原句：" : "改后："}</span>
        {parts.map((part, i) => part.changed
          ? <mark key={i} className={cn("rounded-[3px] px-0.5 text-foreground", removed ? "bg-destructive/20" : "bg-good/25")}>{part.text}</mark>
          : <span key={i}>{part.text}</span>)}
      </span>
    </div>
  );
}
