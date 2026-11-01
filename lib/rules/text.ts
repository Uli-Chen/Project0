const WORD_RE = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;

export function countWords(text: string): number {
  return text.match(WORD_RE)?.length ?? 0;
}

export type Sentence = { id: number; para: number; start: number; end: number; text: string };

const ABBREVIATIONS = ["e.g.", "i.e.", "etc.", "Mr.", "Dr.", "U.S."];

function endsWithAbbreviation(text: string, dotIndex: number): boolean {
  return ABBREVIATIONS.some((abbr) => text.slice(dotIndex - abbr.length + 1, dotIndex + 1) === abbr);
}

/** 按空行分段；段内以 .?! 后接空白与大写字母或段落结尾为句界。 */
export function splitSentences(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  const paraRe = /[^\n]+(?:\n(?!\s*\n)[^\n]*)*/g;
  let para = 0;
  for (const match of text.matchAll(paraRe)) {
    const paraText = match[0];
    if (!paraText.trim()) continue;
    const base = match.index ?? 0;
    let cursor = 0;
    for (let i = 0; i < paraText.length; i++) {
      const ch = paraText[i];
      if (ch !== "." && ch !== "?" && ch !== "!") continue;
      let j = i + 1;
      while (j < paraText.length && /["'”’)]/.test(paraText[j])) j++;
      const atEnd = paraText.slice(j).trim() === "";
      const nextIsBoundary = /^\s+["“‘(]?[A-Z]/.test(paraText.slice(j));
      if (!atEnd && !nextIsBoundary) continue;
      if (ch === "." && endsWithAbbreviation(paraText, i)) continue;
      pushSentence(sentences, text, base, cursor, j, para);
      cursor = j;
      if (atEnd) break;
    }
    if (paraText.slice(cursor).trim()) pushSentence(sentences, text, base, cursor, paraText.length, para);
    para++;
  }
  return sentences;
}

function pushSentence(out: Sentence[], text: string, base: number, from: number, to: number, para: number) {
  let start = base + from;
  let end = base + to;
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  if (start < end) out.push({ id: out.length + 1, para, start, end, text: text.slice(start, end) });
}

export type DiffPart = { kind: "same" | "added" | "removed"; text: string };

/** 词级差异（LCS）。相邻的改动合并成“一段删除＋一段新增”，便于界面显示删除线与新增高亮。 */
export function wordDiff(a: string, b: string): DiffPart[] {
  const tokenize = (s: string) => s.match(/\S+\s*|\s+/g) ?? [];
  const x = tokenize(a);
  const y = tokenize(b);
  const key = (t: string) => t.trimEnd();
  const dp: number[][] = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      dp[i][j] = key(x[i]) === key(y[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const parts: DiffPart[] = [];
  let removed = "";
  let added = "";
  const flush = () => {
    if (removed) parts.push({ kind: "removed", text: removed });
    if (added) parts.push({ kind: "added", text: added });
    removed = "";
    added = "";
  };
  const same = (t: string) => {
    flush();
    const last = parts[parts.length - 1];
    if (last?.kind === "same") last.text += t;
    else parts.push({ kind: "same", text: t });
  };
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    if (key(x[i]) === key(y[j])) {
      same(y[j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      removed += x[i++];
    } else {
      added += y[j++];
    }
  }
  while (i < x.length) removed += x[i++];
  while (j < y.length) added += y[j++];
  flush();
  return parts;
}
