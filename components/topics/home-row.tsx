import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export const rowGrid = 'grid grid-cols-[2.25rem_minmax(0,1fr)_1.25rem] items-center gap-x-3 py-5 sm:grid-cols-[2.5rem_6.5rem_minmax(0,1fr)_1.25rem] sm:gap-x-4';

/** One numbered line on the home page: number, label, what it says, and an arrow when it leads somewhere. */
export function Row({ n, label, href, children }: { n: number; label: string; href?: string; children: React.ReactNode }) {
  const body = <RowBody n={n} label={label} end={href ? <ArrowUpRight className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden /> : null}>{children}</RowBody>;
  return href ? <Link href={href} className={cn(rowGrid, 'group')}>{body}</Link> : <div className={rowGrid}>{body}</div>;
}

/** The cells of a row; on phones the label sits above the content in the middle column. */
export function RowBody({ n, label, end, children }: { n: number; label: string; end: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <span className="self-start pt-0.5 text-[14px] text-muted-foreground tabular-nums sm:self-center sm:pt-0">{String(n).padStart(2, '0')}</span>
      <span className="text-[15px] text-muted-foreground max-sm:col-start-2 max-sm:row-start-1">{label}</span>
      <span className="min-w-0 max-sm:col-start-2 max-sm:row-start-2 max-sm:mt-1">{children}</span>
      <span className="justify-self-end max-sm:col-start-3 max-sm:row-span-2 max-sm:row-start-1">{end}</span>
    </>
  );
}

export function Big({ value, unit, note }: { value: string | number; unit: string; note?: string }) {
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="text-[34px] leading-none font-semibold tracking-[-0.03em] tabular-nums">{value}</span>
      <span className="text-[15px] whitespace-nowrap text-muted-foreground">{unit}</span>
      {note && <span className="truncate text-[15px] text-muted-foreground"><span className="mx-1 text-faint">·</span>{note}</span>}
    </span>
  );
}
