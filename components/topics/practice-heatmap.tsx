import { cn } from '@/lib/utils';

import { practiceDays } from '@/lib/learning/practice-days';

const WEEKS = 16;
const shade = (count: number | null) => count === null ? 'bg-transparent' : count === 0 ? 'bg-sunk' : count === 1 ? 'bg-primary/35' : count === 2 ? 'bg-primary/65' : 'bg-primary';

export function PracticeHeatmap({ times }: { times: (string | null | undefined)[] }) {
  const { weeks, activeDays } = practiceDays(times, WEEKS);
  // A month label sits over the first week that starts in that month.
  const months = weeks.map((week, i) => {
    const month = Number(week[0].date.slice(5, 7));
    return i === 0 || month !== Number(weeks[i - 1][0].date.slice(5, 7)) ? `${month}月` : '';
  });
  return (
    <section aria-label="练习日历" className="border-t border-foreground pt-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] text-muted-foreground">练习日历</h2>
        <p className="text-[15px] tabular-nums"><b className="font-semibold">{activeDays}</b> 天</p>
      </div>
      <div className="mt-4 grid grid-cols-[repeat(16,minmax(0,1fr))] gap-[3px]" role="img" aria-label={`最近 ${WEEKS} 周有 ${activeDays} 天在练习`}>
        {months.map((label, i) => <span key={`m${i}`} className="h-5 text-[12px] whitespace-nowrap text-muted-foreground" style={{ gridColumn: i + 1, gridRow: 1 }}>{label}</span>)}
        {weeks.map((week, w) => week.map((cell, d) => (
          <span
            key={cell.date}
            title={cell.count === null ? undefined : `${cell.date.slice(5).replace('-', '月')}日 · ${cell.count} 次`}
            className={cn('aspect-square rounded-[3px]', shade(cell.count), cell.today && 'outline outline-1 -outline-offset-1 outline-foreground/70')}
            style={{ gridColumn: w + 1, gridRow: d + 2 }}
          />
        )))}
      </div>
    </section>
  );
}
