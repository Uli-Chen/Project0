import { splitSentences } from "../rules/text";
import type { Issue } from "../prototype/types";

export type DraftMark = { start: number; end: number; rank: number; sentenceId: number };

/** Problem sentences from the original that still stand word for word in the revision draft.
 * A sentence the student has already touched is no longer marked. */
export function draftMarks(original: string, draft: string, issues: Pick<Issue, "rank" | "sentenceIds">[]): DraftMark[] {
  const sentences = new Map(splitSentences(original).map(s => [s.id, s.text]));
  const marks: DraftMark[] = [];
  for (const issue of [...issues].sort((a, b) => a.rank - b.rank)) {
    for (const id of issue.sentenceIds) {
      const text = sentences.get(id);
      if (!text || marks.some(m => m.sentenceId === id)) continue;
      let at = draft.indexOf(text);
      while (at >= 0 && marks.some(m => at < m.end && at + text.length > m.start)) at = draft.indexOf(text, at + 1);
      if (at >= 0) marks.push({ start: at, end: at + text.length, rank: issue.rank, sentenceId: id });
    }
  }
  return marks.sort((a, b) => a.start - b.start);
}

/** How many of each issue's sentences are still untouched. */
export function remainingByIssue(marks: DraftMark[], issues: Pick<Issue, "rank" | "sentenceIds">[]) {
  return issues.map(issue => ({ rank: issue.rank, total: issue.sentenceIds.length, remaining: issue.sentenceIds.filter(id => marks.some(m => m.sentenceId === id)).length }));
}
