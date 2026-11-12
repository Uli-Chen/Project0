import { splitSentences } from "../rules/text";
import type { SessionState } from "../pipeline/types";

/** Everything here is derived from the student's own practice: expressions they adopted and
 * sentences that were flagged in their essays. Nothing is generated for the review page. */
export type PhraseItem = { id: string; kind: "phrase"; prompt: string; answer: string; note: string; sessionId: string; date: string };
/** `answer` is the student's own rewrite of the sentence, null while it has not been rewritten;
 * `revised` says whether the essay has a submitted revision at all. */
export type FixItem = { id: string; kind: "fix"; prompt: string; answer: string | null; revised: boolean; issueTitle: string; hint: string; sessionId: string; rank: number; date: string };
export type ReviewItem = PhraseItem | FixItem;
type Grade = "good" | "again";
/** `graded` remembers the most recent presentations of a card that were graded (key and grade, oldest
 * first, at most `GRADED_KEYS`), so a retried grade is applied once even when another tab graded the
 * same card in between. `key`/`result` are the single-key form written before; they are still read. */
export type ReviewEntry = { box: number; due: string; graded?: [string, Grade][]; key?: string; result?: Grade };
export type ReviewState = Record<string, ReviewEntry>;

/** Days until the next review after a correct recall, by box. */
export const REVIEW_INTERVALS = [1, 3, 7, 14, 30];
const DAY = 86_400_000;

/** Rough stems, so that "feels" → "feel" or "costs" → "cost" still count as the same word. */
const words = (text: string) => new Set((text.toLowerCase().match(/[a-z]+(?:['’-][a-z]+)*/g) ?? []).map(word => word.length > 3 ? word.replace(/(?:ies|es|s|ed|ing)$/, "") : word));

/** The revised sentence that most plausibly replaced an original one: highest word overlap,
 * different text. Returns null when nothing in the revision is close enough to be "the fix". */
export function matchRevision(before: string, revisionSentences: string[]): string | null {
  const source = words(before);
  if (!source.size) return null;
  let best: string | null = null, bestScore = 0;
  for (const candidate of revisionSentences) {
    if (candidate.trim() === before.trim()) return null;
    const target = words(candidate);
    const shared = [...source].filter(word => target.has(word)).length;
    const score = shared / (source.size + target.size - shared);
    if (score > bestScore) { best = candidate; bestScore = score; }
  }
  return bestScore >= 0.35 ? best : null;
}

export function reviewItems(sessions: SessionState[]): ReviewItem[] {
  const items: ReviewItem[] = [];
  for (const session of sessions) {
    if (session.activity !== "deep") continue;
    const date = session.completedAt ?? session.updatedAt ?? session.createdAt;
    for (const suggestion of Object.values(session.suggestions ?? {})) {
      if (suggestion.type !== "express" || suggestion.status !== "accepted") continue;
      const reply = session.messages.findIndex(m => m.role === "coach" && m.suggestionIds?.includes(suggestion.id));
      const asked = reply > 0 ? session.messages.slice(0, reply).reverse().find(m => m.role === "user") : undefined;
      if (!asked?.content.trim()) continue;
      items.push({ id: `phrase:${session.id}:${suggestion.id}`, kind: "phrase", prompt: asked.content.trim(), answer: suggestion.suggestedText, note: suggestion.reason, sessionId: session.id, date });
    }
    const original = session.submitted?.original;
    if (!session.evaluation || !original) continue;
    const sentences = splitSentences(original);
    const revision = session.submitted.revision ? splitSentences(session.submitted.revision).map(s => s.text) : [];
    // Which flagged sentences get a card must not depend on the revision: a card created from the
    // first feedback keeps its id (and its review progress) after the student submits a rewrite.
    // A revision only adds the student's own fix as the answer, or reveals more rewritten sentences.
    const drilled = new Set<number>();
    for (const issue of session.evaluation.issues) {
      let kept = 0;
      for (const sentenceId of issue.sentenceIds) {
        if (kept >= 2 || drilled.has(sentenceId) || !sentences.some(s => s.id === sentenceId)) continue;
        drilled.add(sentenceId); kept++;
      }
    }
    const seen = new Set<number>();
    for (const issue of session.evaluation.issues) {
      for (const sentenceId of issue.sentenceIds) {
        const before = sentences.find(s => s.id === sentenceId)?.text;
        if (!before || seen.has(sentenceId)) continue;
        // null: not rewritten yet (or no revision at all). The card stays and says so.
        const answer = revision.length ? matchRevision(before, revision) : null;
        if (!answer && !drilled.has(sentenceId)) continue;
        seen.add(sentenceId);
        items.push({ id: `fix:${session.id}:${sentenceId}`, kind: "fix", prompt: before, answer, revised: revision.length > 0, issueTitle: issue.title, hint: issue.hintL1, sessionId: session.id, rank: issue.rank, date });
      }
    }
  }
  return items.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

/** New items are due at once; reviewed items come back when their interval has passed. */
export function dueItems(items: ReviewItem[], state: ReviewState, now = new Date()): ReviewItem[] {
  return items.filter(item => { const entry = state[item.id]; return !entry || Date.parse(entry.due) <= now.getTime(); });
}

export const GRADED_KEYS = 20;

/** Apply one self-grade. A grade carrying the key of a presentation that was already applied is a
 * retry after a lost response: the stored entry comes back unchanged instead of advancing again, and
 * `result` is the grade recorded for that presentation the first time. */
export function gradeReview(entry: ReviewEntry | undefined, result: Grade, key: string | undefined, now = new Date()): { entry: ReviewEntry; applied: boolean; result: Grade } {
  const graded: [string, Grade][] = entry?.graded ?? (entry?.key && entry.result ? [[entry.key, entry.result]] : []);
  const earlier = key ? graded.find(([seen]) => seen === key) : undefined;
  if (entry && earlier) return { entry, applied: false, result: earlier[1] };
  const next: ReviewEntry = nextReview(entry, result, now);
  const kept = key ? [...graded, [key, result] as [string, Grade]].slice(-GRADED_KEYS) : graded;
  if (kept.length) next.graded = kept;
  return { entry: next, applied: true, result };
}

export function nextReview(entry: { box: number } | undefined, result: Grade, now = new Date()): ReviewEntry {
  if (result === "again") return { box: 0, due: now.toISOString() };
  const box = Math.min((entry?.box ?? 0) + 1, REVIEW_INTERVALS.length);
  return { box, due: new Date(now.getTime() + REVIEW_INTERVALS[box - 1] * DAY).toISOString() };
}
