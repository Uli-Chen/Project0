import Link from "next/link";

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" aria-label="project 0" className="flex shrink-0 items-baseline gap-1 text-[15px] font-semibold tracking-[-0.02em] text-foreground">
      {!compact && "project"}
      <span className="font-serif text-[22px] font-normal italic leading-none">0</span>
    </Link>
  );
}
