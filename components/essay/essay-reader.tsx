"use client";

import { Fragment, useMemo, type CSSProperties } from "react";
import { splitSentences } from "@/lib/rules";
import { cn } from "@/lib/utils";

/**
 * 问题句统一用教练蓝：平时是浅底色加一条细下划线，选中或悬停时底色加深、下划线变粗。
 * 不同问题靠句前编号区分，不再按序号轮换颜色。--hl-1 浅底，--hl-2 选中底，--hl-3 下划线。
 * 选中别的问题时（dim），只去掉底色、下划线变浅；正文和编号保持实色，照样好读。
 */
export function issueMarkStyle(active: boolean, dim = false): CSSProperties {
  const wash = dim ? "transparent" : active ? "var(--hl-2)" : "var(--hl-1)";
  const line = dim ? "var(--hl-2)" : "var(--hl-3)";
  return {
    backgroundImage: `linear-gradient(${line}, ${line}), linear-gradient(${wash}, ${wash})`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "0 100%, 0 100%",
    backgroundSize: `100% ${active ? 2 : 1}px, 100% 100%`,
    boxDecorationBreak: "clone",
    WebkitBoxDecorationBreak: "clone",
  };
}

export type Mark = { sentenceId: number; rank: number };

/** 按段落显示作文；被问题引用的句子用马克笔式的底色标出，并带上句子编号。 */
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
                    className={cn("rounded-[2px] transition-[background-size] duration-(--dur-layout) ease-(--ease-soft)", onMarkClick && "cursor-pointer")}
                    style={issueMarkStyle(activeRank != null && Boolean(ranks?.includes(activeRank)), dim)}
                  >
                    {/* Raised by offset, not by vertical-align, so the 14px number never makes its line taller. */}
                    <sup className="relative -top-[0.45em] mr-1 align-baseline font-sans text-[14px] leading-none font-medium text-coach not-italic tabular-nums">{s.id}</sup>
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
