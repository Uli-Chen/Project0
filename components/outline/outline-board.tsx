"use client";

import { Check, CircleDashed, CircleDot } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getSlot } from "@/lib/prototype/session-store";
import { outlineGroups } from "@/lib/learning/prewrite-guidance";
import type { Outline, Review, Prompt } from "@/lib/prototype/types";
import { cn } from "@/lib/utils";

type Coverage = Review["outlineCoverage"];

const GROUPS = outlineGroups();

const ALL_PATHS = GROUPS.flatMap((g) => g.slots.map((s) => s.path as string));

const COVERAGE_LABEL = { written: "已写进文章", partly: "写了一部分", missing: "没有写到" } as const;

/** Escape 撤销本次编辑：文字已逐字同步到共享草稿，所以要把进入编辑前的值写回去；没改动就什么都不做 */
export function slotCancelRestore(before: string | null, current: string | null): string | null {
  return (current ?? "") === (before ?? "") ? null : before ?? "";
}

export function outlineProgress(outline: Outline) {
  return { filled: ALL_PATHS.filter((p) => getSlot(outline, p)).length, total: ALL_PATHS.length };
}

/** 提纲本身不带标题行，标题与“想好了 n / 9”由所在的栏提供 */
export function OutlineBoard({
  outline,
  onEdit,
  coverage,
  density = "comfortable",
  layout = "stack",
  questionType = "agree_disagree",
}: {
  outline: Outline;
  onEdit?: (path: string, text: string) => void;
  coverage?: Coverage;
  density?: "comfortable" | "compact";
  /** grid：写前放在纸面中间时分两栏；stack：侧栏里上下排 */
  layout?: "stack" | "grid";
  questionType?: Prompt["questionType"];
}) {
  const { filled } = outlineProgress(outline);
  const groups = outlineGroups(questionType);
  const flash = useFlash(outline);
  const coverageOf = (path: string) => coverage?.find((c) => c.slot === path)?.status;

  return (
    <div className="flex flex-col">
      {!coverage && (
        <div className="h-[3px] overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-coach transition-[width] duration-500" style={{ width: `${(filled / ALL_PATHS.length) * 100}%` }} />
        </div>
      )}
      <div className={cn("mt-5", layout === "grid" ? "grid gap-x-10 gap-y-8 sm:grid-cols-2" : "flex flex-col", layout === "stack" && (density === "compact" ? "gap-4" : "gap-6"))}>
        {groups.map((group, i) => (
          <section key={group.title} className="motion-reveal" style={{ "--i": i } as React.CSSProperties}>
            <h3 className="text-sm font-semibold">{group.title}</h3>
            <div className={cn("mt-1.5 flex flex-col", group.slots.length > 1 && "border-l border-border pl-3.5")}>
              {group.slots.map((slot) => (
                <SlotRow
                  key={slot.path}
                  label={slot.label}
                  accessibleLabel={`${group.title}${slot.label ? `：${slot.label}` : ""}`}
                  text={getSlot(outline, slot.path)?.text ?? null}
                  flash={flash === slot.path}
                  coverage={coverageOf(slot.path)}
                  onSave={onEdit ? (text) => onEdit(slot.path, text) : undefined}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function SlotRow({
  label,
  accessibleLabel,
  text,
  flash,
  coverage,
  onSave,
}: {
  label: string | null;
  accessibleLabel: string;
  text: string | null;
  flash: boolean;
  coverage?: "written" | "partly" | "missing";
  onSave?: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  // 输入框显示原样文字（含正在打的空格）；每次输入都同步到共享草稿，由统一的防抖保存和离开保护负责
  const [draft, setDraft] = useState(text ?? "");
  const before = useRef<string | null>(null);

  const start = () => {
    if (!onSave) return;
    before.current = text;
    setDraft(text ?? "");
    setEditing(true);
  };
  const change = (value: string) => {
    setDraft(value);
    if (value.trim() !== (text ?? "")) onSave?.(value);
  };
  const commit = () => setEditing(false);
  const cancel = () => {
    setEditing(false);
    const restore = slotCancelRestore(before.current, text);
    if (restore !== null) onSave?.(restore);
  };

  return (
    <div className={cn("group -mx-2 rounded-md px-2 py-1.5 transition-colors", flash ? "bg-coach-soft duration-700" : onSave && !editing && "duration-(--dur-fast) hover:bg-sunk")}>
      {label && <p className="text-[14px] text-muted-foreground">{label}</p>}
      {editing ? (
        <textarea
          autoFocus
          value={draft}
          aria-label={accessibleLabel}
          maxLength={2000}
          rows={2}
          onChange={(e) => change(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") cancel();
          }}
          className="mt-0.5 w-full resize-none rounded-md border border-coach/40 bg-sheet px-2 py-1 text-sm outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={start}
          aria-label={`${accessibleLabel}：${text ?? "还没想好"}`}
          disabled={!onSave}
          className={cn(
            "mt-0.5 flex w-full items-start gap-2 text-left text-sm leading-relaxed",
            text ? "text-foreground" : "text-faint",
            onSave && "cursor-text",
          )}
        >
          <span className="flex-1">{text ?? (onSave ? <><span className="group-hover:hidden">还没想好</span><span className="hidden group-hover:inline">点这里写</span></> : "还没想好")}</span>
          {coverage && text && <CoverageMark status={coverage} />}
        </button>
      )}
    </div>
  );
}

function CoverageMark({ status }: { status: "written" | "partly" | "missing" }) {
  const Icon = status === "written" ? Check : status === "partly" ? CircleDot : CircleDashed;
  return (
    <span
      title={COVERAGE_LABEL[status]}
      className={cn(
        "motion-pop mt-0.5 flex shrink-0 items-center gap-1 text-xs",
        status === "written" ? "text-good" : status === "partly" ? "text-warn" : "text-muted-foreground",
      )}
    >
      <Icon className="size-3.5" />
      {COVERAGE_LABEL[status]}
    </span>
  );
}

/** 返回刚被教练填上的槽位路径，用于短暂高亮 */
function useFlash(outline: Outline) {
  const prev = useRef(outline);
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    const changed = ALL_PATHS.find((p) => !getSlot(prev.current, p) && getSlot(outline, p));
    prev.current = outline;
    if (!changed) return;
    setFlash(changed);
    const t = setTimeout(() => setFlash(null), 1400);
    return () => clearTimeout(t);
  }, [outline]);
  return flash;
}
