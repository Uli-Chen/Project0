import { wordDiff } from "@/lib/rules";
import { cn } from "@/lib/utils";

/** tone="coach"：教练建议的改动；tone="revision"：学生自己的改写 */
export function DiffText({ from, to, className, tone = "coach" }: { from: string; to: string; className?: string; tone?: "coach" | "revision" }) {
  return (
    <span className={className}>
      {wordDiff(from, to).map((part, i) =>
        part.kind === "same" ? (
          <span key={i}>{part.text}</span>
        ) : part.kind === "removed" ? (
          <del key={i} className="box-decoration-clone text-muted-foreground/70 decoration-muted-foreground/50">
            {part.text}
          </del>
        ) : (
          <ins key={i} className={cn("box-decoration-clone rounded-[2px] px-0.5 -mx-0.5 no-underline", tone === "coach" ? "bg-coach-soft text-coach" : "bg-good/12 text-foreground")}>
            {part.text}
          </ins>
        ),
      )}
    </span>
  );
}
