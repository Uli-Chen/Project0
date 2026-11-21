"use client";

import { ArrowUp } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function Composer({
  placeholder,
  onSend,
  disabled,
  focusKey,
  top,
  toolbar,
  draft, onDraftChange,
  maxLength = 12000,
}: {
  placeholder: string;
  onSend: (text: string) => void;
  disabled?: boolean;
  /** 变化时把焦点移到输入框，例如带着引用切过来 */
  focusKey?: unknown;
  top?: ReactNode;
  toolbar?: ReactNode;
  draft?: string;
  onDraftChange?: (text: string) => void;
  /** 输入上限；到约 92%（12,000 时为 11,000）才显示计数 */
  maxLength?: number;
}) {
  const [localText, setLocalText] = useState("");
  const text = draft ?? localText;
  const setText = (next: string) => { setLocalText(next); onDraftChange?.(next); };
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  useLayoutEffect(() => {
    if (focusKey) ref.current?.focus();
  }, [focusKey]);

  const send = () => {
    const value = text.trim();
    if (!value || disabled) return;
    onSend(value);
    setText("");
  };

  return (
    <div className="rounded-xl border border-input bg-sunk transition-colors focus-within:border-primary/60 focus-within:bg-sheet">
      {top && <div className="flex flex-wrap gap-1.5 px-2.5 pt-2.5">{top}</div>}
      <textarea
        ref={ref}
        rows={2}
        value={text}
        aria-label={placeholder}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        className="block max-h-[180px] w-full resize-none bg-transparent px-3 pt-2.5 text-sm leading-relaxed outline-none placeholder:text-faint"
      />
      <div className="flex items-center gap-2 px-2 pb-2">
        <div className="min-w-0 flex-1">{toolbar}</div>
        {text.length >= Math.round(maxLength * 11 / 12) && <span role="status" className="meta motion-swap">{text.length.toLocaleString()} / {maxLength.toLocaleString("en-US")}</span>}
        <button
          type="button"
          onClick={send}
          disabled={!text.trim() || disabled}
          aria-label="发送"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-[opacity,transform] duration-(--dur-fast) ease-(--ease-soft) enabled:hover:bg-primary/90 enabled:active:scale-92 disabled:opacity-25"
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
    </div>
  );
}
