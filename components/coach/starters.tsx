"use client";

/** 示范问题：放在教练输入区，点一下就发给教练。用它代替“这里可以做什么”的说明文字。 */
export function Starters({ items, onPick, disabled }: { items: string[]; onPick: (text: string) => void; disabled?: boolean }) {
  if (!items.length) return null;
  return (
    <div role="group" aria-label="可以这样问教练" className="motion-stagger flex flex-wrap gap-2">
      {items.map((text) => (
        <button
          key={text}
          type="button"
          disabled={disabled}
          onClick={() => onPick(text)}
          className="motion-press rounded-full border border-input bg-sheet px-3.5 py-1.5 text-left text-sm leading-snug transition-colors duration-(--dur-fast) hover:border-coach-line hover:bg-coach-soft disabled:pointer-events-none disabled:opacity-50"
        >
          {text}
        </button>
      ))}
    </div>
  );
}
