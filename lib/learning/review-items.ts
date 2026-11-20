import { splitSentences } from "../rules/text";
import { sessionTopic } from "./session-topic";
import type { SessionState } from "../pipeline/types";

/** Everything here is derived from the student's own practice: expressions they adopted and
 * sentences that were flagged in their essays. Nothing is generated for the review page. */
export type PhraseItem = { id: string; kind: "phrase"; prompt: string; answer: string; note: string; sessionId: string; date: string; topic: string | null };
/** `answer` is the student's own rewrite, only when a check confirmed the problem was fixed (the
 * full-revision comparison judged the issue resolved); otherwise null, shown as "not fixed yet".
 * `revised` says whether the essay has a submitted revision at all. */
export type FixItem = { id: string; kind: "fix"; prompt: string; answer: string | null; revised: boolean; issueTitle: string; hint: string; sessionId: string; rank: number; date: string; topic: string | null };
/** A sentence the student fixed and a check confirmed. Mixed into spot-the-problem reviews, where
 * the right answer is that nothing is wrong; it only appears once its flagged sentence is past the
 * hinted stage, and is never listed on its own. */
export type SoundItem = { id: string; kind: "sound"; prompt: string; fixId: string; sessionId: string; date: string; topic: string | null };
export type ReviewItem = PhraseItem | FixItem | SoundItem;
type Grade = "good" | "again";
/** One card's schedule. Which presentations were already graded is kept in the request_receipts table
 * (see app/api/review/route.ts), not here. `graded`/`key`/`result` are what earlier builds stored in
 * the profile; they are only read, so a retry of a grade made before the switch is still recognised. */
export type ReviewEntry = { box: number; due: string; graded?: [string, Grade, string?][]; key?: string; result?: Grade };
export type ReviewState = Record<string, ReviewEntry>;

/** A new item is first due a day after it was made; after a correct answer the next review comes
 * these many days later, by box; the third correct answer in a row retires the item ("已掌握"). */
export const REVIEW_INTERVALS = [3, 7];
export const MASTERED_AT = 3;
/** Flagged sentences show the problem and the hint for their first two reviews, then only the sentence. */
export const HINTED_UNTIL = 2;
/** At most this many reviews a day, oldest due first. */
export const DAILY_LIMIT = 8;
const DAY = 86_400_000;

/** Only language problems (grammar, vocabulary) become sentence cards: their rule carries over to any
 * sentence. Argument and structure problems are a skill practised on new material, not a sentence to
 * re-fix. The issue code is written by the grader; its band prefix (GRA, LR or LEX) is the signal,
 * and a code without a recognised prefix is left out rather than risk drilling an argument problem. */
export function languageIssue(code: string) {
  return /^(GRA(MMAR)?|LR|LEX(ICAL)?|VOCAB(ULARY)?)(?![A-Z])/i.test(code.trim());
}

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
    // Every item is tagged with its essay's topic, so the libraries can be filtered by topic.
    const topic = sessionTopic(session);
    for (const suggestion of Object.values(session.suggestions ?? {})) {
      if (suggestion.type !== "express" || suggestion.status !== "accepted") continue;
      const reply = session.messages.findIndex(m => m.role === "coach" && m.suggestionIds?.includes(suggestion.id));
      const asked = reply > 0 ? session.messages.slice(0, reply).reverse().find(m => m.role === "user") : undefined;
      if (!asked?.content.trim()) continue;
      items.push({ id: `phrase:${session.id}:${suggestion.id}`, kind: "phrase", prompt: asked.content.trim(), answer: suggestion.suggestedText, note: suggestion.reason, sessionId: session.id, date, topic });
    }
    const original = session.submitted?.original;
    if (!session.evaluation || !original) continue;
    const sentences = splitSentences(original);
    const revision = session.submitted.revision ? splitSentences(session.submitted.revision) : [];
    // Which flagged sentences get a card must not depend on the revision: a card created from the
    // first feedback keeps its id (and its review progress) after the student submits a rewrite.
    const drilled = new Set<number>();
    const language = session.evaluation.issues.filter(issue => languageIssue(issue.code));
    for (const issue of language) {
      let kept = 0;
      for (const sentenceId of issue.sentenceIds) {
        if (kept >= 2 || drilled.has(sentenceId) || !sentences.some(s => s.id === sentenceId)) continue;
        drilled.add(sentenceId); kept++;
      }
    }
    const seen = new Set<number>();
    for (const issue of language) {
      // Only a rewrite the comparison judged resolved counts as the answer, matched among the
      // revision sentences it cited for this issue.
      const result = session.comparison?.issues.find(item => item.rank === issue.rank);
      const verified = result?.status === "resolved" ? revision.filter(s => result.revisionSentenceIds.includes(s.id)).map(s => s.text) : [];
      for (const sentenceId of issue.sentenceIds) {
        const before = sentences.find(s => s.id === sentenceId)?.text;
        if (!before || seen.has(sentenceId)) continue;
        const answer = verified.length ? matchRevision(before, verified) : null;
        if (!answer && !drilled.has(sentenceId)) continue;
        seen.add(sentenceId);
        const id = `fix:${session.id}:${sentenceId}`;
        items.push({ id, kind: "fix", prompt: before, answer, revised: revision.length > 0, issueTitle: issue.title, hint: issue.hintL1, sessionId: session.id, rank: issue.rank, date, topic });
        if (answer) items.push({ id: `sound:${session.id}:${sentenceId}`, kind: "sound", prompt: answer, fixId: id, sessionId: session.id, date, topic });
      }
    }
  }
  return items.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export const mastered = (entry: { box: number } | undefined) => (entry?.box ?? 0) >= MASTERED_AT;
/** When an item is next due: its schedule, or a day after it was made. */
export function dueAt(item: ReviewItem, state: ReviewState) {
  const entry = state[item.id];
  return entry ? Date.parse(entry.due) : Date.parse(item.date) + DAY;
}
/** Whether a flagged sentence (or a sound sentence) is shown as "spot the problem", without hints. */
export function spotStage(item: ReviewItem, state: ReviewState) {
  return item.kind === "sound" || (item.kind === "fix" && (state[item.id]?.box ?? 0) >= HINTED_UNTIL);
}

/** Everything due now and not mastered, oldest due first. A sound sentence waits until the sentence
 * it was fixed from has reached the spot-the-problem stage. */
export function dueItems(items: ReviewItem[], state: ReviewState, now = new Date()): ReviewItem[] {
  return items
    .filter(item => !mastered(state[item.id]) && dueAt(item, state) <= now.getTime() && (item.kind !== "sound" || (state[item.fixId]?.box ?? 0) >= HINTED_UNTIL))
    .sort((a, b) => dueAt(a, state) - dueAt(b, state) || a.id.localeCompare(b.id));
}

/** Today's reviews: what is due, capped at the daily limit. */
export function todayItems(items: ReviewItem[], state: ReviewState, now = new Date()): ReviewItem[] {
  return dueItems(items, state, now).slice(0, DAILY_LIMIT);
}

/** One key per time a card is shown; a retry of the same grade reuses it. */
export function presentationKey() { return crypto.randomUUID(); }

/** Grades an earlier build recorded in the profile entry, as [presentation key, grade]. */
export function legacyGrades(entry: ReviewEntry | undefined): [string, Grade][] {
  if (!entry) return [];
  const list: [string, Grade][] = (entry.graded ?? []).map(([key, grade]) => [key, grade]);
  if (entry.key && entry.result && !list.some(([key]) => key === entry.key)) list.push([entry.key, entry.result]);
  return list;
}
/** The grade an earlier build recorded in the profile for this presentation, if any. */
export function legacyGrade(entry: ReviewEntry | undefined, key: string | undefined): Grade | null {
  if (!key) return null;
  return legacyGrades(entry).find(([seen]) => seen === key)?.[1] ?? null;
}

/** Apply one self-grade: the next schedule, without any of the legacy receipt fields. */
export function gradeReview(entry: ReviewEntry | undefined, result: Grade, now = new Date()): ReviewEntry {
  return nextReview(entry, result, now);
}

export function nextReview(entry: { box: number } | undefined, result: Grade, now = new Date()): ReviewEntry {
  if (result === "again") return { box: 0, due: now.toISOString() };
  const box = Math.min((entry?.box ?? 0) + 1, MASTERED_AT);
  // A mastered item is never due again; its date only records when it was mastered.
  return { box, due: new Date(now.getTime() + (REVIEW_INTERVALS[box - 1] ?? 0) * DAY).toISOString() };
}
