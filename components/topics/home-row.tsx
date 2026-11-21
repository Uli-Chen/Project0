import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const tile = 'surface flex h-full min-h-[7rem] flex-col p-5';

/** One tile under the home page's recommendation: a label, what it says, and an arrow when it leads somewhere. */
export function Tile({ label, href, children }: { label: string; href?: string; children: React.ReactNode }) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-3 text-[14px] text-muted-foreground">
        {label}
        {href && <ArrowUpRight className="size-4 text-faint transition-[color,translate] duration-(--dur-fast) ease-(--ease-soft) group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" aria-hidden />}
      </span>
      <span className="mt-auto block min-w-0 pt-4">{children}</span>
    </>
  );
  return href
    ? <Link href={href} className={cn(tile, 'group motion-press hover:shadow-[0_0_0_1px_var(--coach-line),0_14px_28px_-14px_color-mix(in_srgb,var(--coach)_35%,transparent)]')}>{body}</Link>
    : <div className={tile}>{body}</div>;
}

/** A count with its unit, and an optional line under it. */
export function Big({ value, unit, note, tone }: { value: string | number; unit: string; note?: string; tone?: 'good' }) {
  return (
    <span className="block min-w-0">
      <span className="flex min-w-0 items-baseline gap-2">
        <span className={cn('text-[28px] leading-none font-semibold tracking-[-0.03em] tabular-nums', tone === 'good' && 'text-good')}>{value}</span>
        <span className="truncate text-[14px] text-muted-foreground">{unit}</span>
      </span>
      {note && <span className="mt-1.5 block truncate text-[14px] text-muted-foreground">{note}</span>}
    </span>
  );
}
