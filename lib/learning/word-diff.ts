export type DiffPart = { text: string; changed: boolean };

/** Words, the spaces between them and punctuation, so a diff can mark whole words and rebuild the text exactly. */
function tokens(text: string) {
  return text.match(/\s+|[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*|[^\sA-Za-z0-9]/g) ?? [];
}

/** Word-level diff of two sentences, by longest common subsequence: the removed side marks what is
 * only in `before`, the added side what is only in `after`. Spaces never count as a change on their
 * own; a run of changed words keeps the spaces inside it marked so it reads as one highlight. */
export function wordDiff(before: string, after: string): { removed: DiffPart[]; added: DiffPart[] } {
  const a = tokens(before), b = tokens(after);
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const keepA = new Array<boolean>(a.length).fill(false), keepB = new Array<boolean>(b.length).fill(false);
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) { keepA[i++] = true; keepB[j++] = true; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }
  return { removed: parts(a, keepA), added: parts(b, keepB) };
}

function parts(list: string[], kept: boolean[]): DiffPart[] {
  const changed = list.map((token, i) => {
    if (!/^\s+$/.test(token)) return !kept[i];
    // A space is changed only when it sits between two changed words.
    const prev = list.slice(0, i).findLastIndex((t) => !/^\s+$/.test(t)), next = list.findIndex((t, k) => k > i && !/^\s+$/.test(t));
    return prev >= 0 && next >= 0 && !kept[prev] && !kept[next];
  });
  const out: DiffPart[] = [];
  list.forEach((text, i) => {
    const last = out.at(-1);
    if (last && last.changed === changed[i]) last.text += text; else out.push({ text, changed: changed[i] });
  });
  return out;
}
