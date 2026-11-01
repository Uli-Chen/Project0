"use client";

import { Fragment, useMemo } from "react";
import { splitSentences } from "@/lib/rules";
import { cn } from "@/lib/utils";

export const ISSUE_TONES = ["var(--hl-1)", "var(--hl-2)", "var(--hl-3)"];
export const ISSUE_SOLID = ["rgb(233 185 73 / 0.7)", "rgb(229 140 138 / 0.7)", "rgb(127 182 133 / 0.7)"];

export type Mark = { sentenceId: number; rank: number };

/** 按段落显示作文；被问题引用的句子用马克笔式的底色标出，并带上句号小字。 */
export function EssayReader({
  text,
  marks = [],
  activeRank,
  onMarkClick,
  onMarkHover,
  className,
}: {
  text: string;
  marks?: Mark[];
  activeRank?: number | null;
  onMarkClick?: (rank: number) => void;
  onMarkHover?: (rank: number | null) => void;
  className?: string;
}) {
  const sentences = useMemo(() => splitSentences(text), [text]);
  const byId = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const m of marks) map.set(m.sentenceId, [...(map.get(m.sentenceId) ?? []), m.rank]);
    return map;
  }, [marks]);
  const paragraphs = useMemo(() => {
    const out: (typeof sentences)[] = [];
    for (const s of sentences) (out[s.para] ??= []).push(s);
    return out;
  }, [sentences]);

  return (
    <div className={cn("prose-essay flex flex-col gap-5", className)}>
      {paragraphs.map((para, i) => (
        <p key={i}>
          {para.map((s, j) => {
            const ranks = byId.get(s.id);
            const rank = ranks?.[0];
            const dim = activeRank != null && rank != null && !ranks?.includes(activeRank);
            return (
              <Fragment key={s.id}>
                {j > 0 && " "}
                {rank == null ? (
                  <span data-sentence={s.id}>{s.text}</span>
                ) : (
                  <span
                    data-sentence={s.id}
                    role={onMarkClick ? "button" : undefined}
                    tabIndex={onMarkClick ? 0 : undefined}
                    onClick={() => onMarkClick?.(activeRank != null && ranks?.includes(activeRank) ? activeRank : rank)}
                    onKeyDown={(e) => e.key === "Enter" && onMarkClick?.(rank)}
                    onMouseEnter={() => onMarkHover?.(rank)}
                    onMouseLeave={() => onMarkHover?.(null)}
                    className={cn("rounded-[3px] transition-[background-size,opacity] duration-300", onMarkClick && "cursor-pointer", dim && "opacity-55")}
                    style={{
                      backgroundImage: `linear-gradient(${ISSUE_TONES[(rank - 1) % 3]}, ${ISSUE_TONES[(rank - 1) % 3]})`,
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "0 100%",
                      backgroundSize: activeRank != null && ranks?.includes(activeRank) ? "100% 100%" : "100% 42%",
                      boxDecorationBreak: "clone",
                      WebkitBoxDecorationBreak: "clone",
                    }}
                  >
                    <sup className="mr-0.5 font-sans text-[10px] font-medium text-muted-foreground not-italic">{s.id}</sup>
                    {s.text}
                  </span>
                )}
              </Fragment>
            );
          })}
        </p>
      ))}
    </div>
  );
}
