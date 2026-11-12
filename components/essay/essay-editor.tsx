"use client";

import { MessageCircleQuestion, ScanSearch, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { countWords } from "@/lib/rules";
import { cn } from "@/lib/utils";
import type { DraftMark } from "@/lib/learning/revision-marks";
import { caretCoordinates } from "./caret";
import { DRAFT_MAX_CHARS } from "@/lib/prototype/session-store";
import { issueMarkStyle } from "./essay-reader";

/** 接近保存上限时才显示字符数 */
const LENGTH_NOTICE_AT = DRAFT_MAX_CHARS - 3000;

function markSegments(text: string, marks: DraftMark[]) {
  const out: { text: string; rank: number | null }[] = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start > cursor) out.push({ text: text.slice(cursor, mark.start), rank: null });
    out.push({ text: text.slice(mark.start, mark.end), rank: mark.rank });
    cursor = mark.end;
  }
  // 结尾补一个换行，镜像层和输入框的高度才一致
  out.push({ text: `${text.slice(cursor)}\n`, rank: null });
  return out;
}

export type SelectionAction = "clarify" | "polish" | "check" | "ask";
export type EditorSelection = { text: string; start: number; end: number };

const ACTIONS: Array<{ action: SelectionAction; label: string; icon: typeof Sparkles }> = [
  { action: "clarify", label: "理清这段", icon: ScanSearch },
  { action: "polish", label: "润色这句", icon: Wand2 },
  { action: "check", label: "检查这段", icon: Sparkles },
  { action: "ask", label: "问教练", icon: MessageCircleQuestion },
];

/**
 * 作答编辑器：衬线正文、自动增高。选中文字后在选区上方浮出协助按钮；
 * 新段落开始后停顿 8 秒，回调 onParagraphPause（用于主动提醒）。
 */
export function EssayEditor({
  value,
  onChange,
  onAction,
  onParagraphPause,
  assist = true,
  readOnly = false,
  placeholder,
  editorRef,
  marks,
  activeRank,
  onCaret,
}: {
  value: string;
  onChange: (text: string) => void;
  onAction?: (action: SelectionAction, selection: EditorSelection) => void;
  onParagraphPause?: (paragraphIndex: number, paragraphText: string) => void;
  assist?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  editorRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** 改写时：原稿里被指出、现在还没动过的句子，在文字下方标出 */
  marks?: DraftMark[];
  activeRank?: number | null;
  onCaret?: (position: number) => void;
}) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const ref = editorRef ?? innerRef;
  const [toolbar, setToolbar] = useState<{ top: number; left: number; selection: EditorSelection } | null>(null);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => { el.style.height = "auto"; el.style.height = `${Math.max(el.scrollHeight, 480)}px`; };
    fit();
    // 栏宽变化时文字重新折行，高度也要跟着变
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => { if (el.clientWidth !== width) { width = el.clientWidth; fit(); } });
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, ref]);

  useEffect(() => () => {
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
  }, []);

  const readSelection = () => {
    const el = ref.current;
    if (!el || !assist) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const text = el.value.slice(start, end);
    if (end - start < 2 || !text.trim()) {
      setToolbar(null);
      return;
    }
    const coords = caretCoordinates(el, start);
    setToolbar({ top: coords.top - 46, left: Math.max(0, Math.min(Math.max(coords.left - 40, 0), el.clientWidth - 360)), selection: { text, start, end } });
  };

  const schedulePause = (text: string, caret: number) => {
    if (!onParagraphPause) return;
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    pauseTimer.current = setTimeout(() => {
      const before = text.slice(0, caret);
      if (!/\n\s*$/.test(before)) return;
      const paragraphs = before.split(/\n+/).map((p) => p.trim()).filter(Boolean);
      const last = paragraphs.at(-1);
      if (last && countWords(last) >= 30) onParagraphPause(paragraphs.length - 1, last);
    }, 8000);
  };

  const words = toolbar ? countWords(toolbar.selection.text) : 0;

  return (
    <div className="relative">
      {marks && marks.length > 0 && (
        <div aria-hidden className="prose-essay pointer-events-none absolute inset-0 overflow-hidden break-words whitespace-pre-wrap text-transparent select-none">
          {markSegments(value, marks).map((segment, i) => segment.rank == null ? <span key={i}>{segment.text}</span> : (
            <span key={i} className="rounded-[2px] transition-[background-size] duration-(--dur-layout) ease-(--ease-soft)" style={issueMarkStyle(activeRank === segment.rank)}>{segment.text}</span>
          ))}
        </div>
      )}
      <textarea
        ref={ref}
        aria-label="英文作文"
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        readOnly={readOnly}
        onChange={(e) => {
          onChange(e.target.value);
          setToolbar(null);
          schedulePause(e.target.value, e.target.selectionStart);
        }}
        onMouseUp={(e) => { readSelection(); onCaret?.(e.currentTarget.selectionStart); }}
        onKeyUp={(e) => { if (e.shiftKey) readSelection(); onCaret?.(e.currentTarget.selectionStart); }}
        onBlur={(e) => { if (toolbarRef.current?.contains(e.relatedTarget as Node)) return; setTimeout(() => setToolbar(null), 160); }}
        maxLength={DRAFT_MAX_CHARS}
        className="prose-essay relative block w-full resize-none overflow-hidden bg-transparent text-foreground outline-none placeholder:text-muted-foreground/60"
      />
      {value.length >= LENGTH_NOTICE_AT && (
        <p role="status" className={cn("meta mt-3 text-right", value.length >= DRAFT_MAX_CHARS && "text-warn")}>
          {value.length.toLocaleString()} / {DRAFT_MAX_CHARS.toLocaleString()} 字符{value.length > DRAFT_MAX_CHARS ? "，超出部分无法保存" : ""}
        </p>
      )}
      {toolbar && onAction && (
        <div
          ref={toolbarRef}
          role="toolbar"
          aria-label="选中文字"
          className="absolute z-20 flex max-w-full flex-wrap items-center gap-0.5 rounded-full bg-foreground p-1 text-background shadow-[0_8px_24px_rgb(0_0_0/0.18)] animate-in fade-in-0 slide-in-from-bottom-1"
          style={{ top: toolbar.top, left: toolbar.left }}
          onMouseDown={(e) => e.preventDefault()}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node) && e.relatedTarget !== ref.current) setToolbar(null); }}
          onKeyDown={(e) => { if (e.key === "Escape") { setToolbar(null); ref.current?.focus(); } }}
        >
          {words > 300 ? (
            <span className="px-3 py-1 text-xs opacity-70">请选择一段以内的文字</span>
          ) : (
            ACTIONS.map(({ action, label, icon: Icon }) => (
              <button
                key={action}
                type="button"
                onClick={() => {
                  onAction(action, toolbar.selection);
                  setToolbar(null);
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] transition-colors hover:bg-background/15 focus-visible:bg-background/15 focus-visible:outline-none",
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
