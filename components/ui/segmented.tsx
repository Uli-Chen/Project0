"use client";

import { cn } from "@/lib/utils";

type Option<T extends string> = { value: T; label: string };

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel = "选择选项",
  size = "md",
}: {
  options: Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex flex-wrap gap-1.5", className)}>
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          tabIndex={value === option.value || (value === null && index === 0) ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            const offsets: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
            let next: number;
            if (event.key === "Home") next = 0;
            else if (event.key === "End") next = options.length - 1;
            else if (event.key in offsets) next = (index + offsets[event.key] + options.length) % options.length;
            else return;
            event.preventDefault();
            onChange(options[next].value);
            event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=radio]")[next]?.focus();
          }}
          className={cn(
            "rounded-full border border-input bg-sheet text-foreground/80 transition-[color,background-color,border-color,transform] duration-(--dur-fast) ease-(--ease-soft) outline-none hover:border-foreground/40 hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 active:scale-[0.97]",
            size === "sm" ? "h-7 px-3 text-xs" : "h-8 px-3.5 text-[13px]",
            value === option.value && "border-primary/60 bg-coach-soft font-medium text-foreground hover:border-primary/60",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
