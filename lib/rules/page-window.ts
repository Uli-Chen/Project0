/** The page numbers to show: the first, the last, and the current one with its neighbours; null marks a gap. */
export function pageWindow(page: number, pages: number): (number | null)[] {
  const keep = [...new Set([1, page - 1, page, page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  return keep.flatMap((n, i) => (i > 0 && n - keep[i - 1] > 1 ? [null, n] : [n]));
}
