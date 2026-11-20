const DAY = 86_400_000;
const taipeiDay = (time: number) => new Date(time + 8 * 3_600_000).toISOString().slice(0, 10);

/** Practice per day (Asia/Taipei) for the last `weekCount` weeks, Monday first, the current week last;
 * days after today have no count. */
export function practiceDays(times: (string | null | undefined)[], weekCount: number, now = new Date()) {
  const counts = new Map<string, number>();
  for (const time of times) if (time) { const day = taipeiDay(Date.parse(time)); counts.set(day, (counts.get(day) ?? 0) + 1); }
  const today = taipeiDay(now.getTime());
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = Date.parse(`${today}T00:00:00Z`) - (weekday + (weekCount - 1) * 7) * DAY;
  const weeks = Array.from({ length: weekCount }, (_, w) => Array.from({ length: 7 }, (_, d) => {
    const date = new Date(start + (w * 7 + d) * DAY).toISOString().slice(0, 10);
    return { date, count: date > today ? null : counts.get(date) ?? 0, today: date === today };
  }));
  return { weeks, activeDays: weeks.flat().filter((cell) => (cell.count ?? 0) > 0).length };
}
