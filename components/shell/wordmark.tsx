import Link from "next/link";

/** AugWrite: "Aug" in the interface face, "Write" in the serif italic, as "project 0" set its 0. */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" aria-label="AugWrite" className="flex shrink-0 items-baseline rounded-sm text-[15px] font-semibold tracking-[-0.02em] text-foreground transition-opacity duration-(--dur-fast) hover:opacity-65">
      {compact ? <span className="font-serif text-[20px] font-normal italic leading-none">A</span> : <>Aug<span className="ml-px font-serif text-[18px] font-normal italic leading-none">Write</span></>}
    </Link>
  );
}
