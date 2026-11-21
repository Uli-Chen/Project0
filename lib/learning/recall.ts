import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { topicCards } from "@/lib/db/schema";
import { cardRequirements, getCard } from "@/lib/db/queries/cards";
import { cardSlots } from "@/lib/quick/layouts";
import type { UserProfile } from "@/lib/auth/types";
import type { SessionState } from "@/lib/pipeline/types";
import { reviewItems } from "./review-items";
import { sessionTopic } from "./session-topic";
import { buildMemory } from "./summary";

/** What the learner already has that bears on the essay in front of them. Everything is their own:
 * problems found in their essays, cards they wrote, expressions they adopted. Nothing is generated. */
export type Recall = {
  /** Problems that came back in more than one essay, most frequent first. */
  habits: { title: string; seen: number; essays: number }[];
  /** Passed idea cards on this essay's topic, other than the one this essay was started from. */
  cards: { id: string; question: string; points: { label: string; text: string }[] }[];
  /** Expressions adopted from the coach, this topic's first. */
  phrases: { id: string; prompt: string; answer: string }[];
};

export function learnerRecall(userId: string, profile: UserProfile, sessions: SessionState[], current: SessionState): Recall {
  const habits = buildMemory(sessions.filter((s) => s.id !== current.id), profile)
    .filter((item) => !item.deleted && item.seen >= 2)
    .sort((a, b) => b.seen - a.seen)
    .slice(0, 2)
    .map((item) => ({ title: item.summary, seen: item.seen, essays: item.checked }));
  const topic = sessionTopic(current);
  const cards = !topic ? [] : getDb().select().from(topicCards).where(eq(topicCards.userId, userId)).all().flatMap((row) => {
    if (row.attemptId === current.id || row.attemptId === current.continuedFromQuickId) return [];
    const card = getCard(userId, row.attemptId), session = sessions.find((s) => s.id === row.attemptId);
    if (!card || !session || sessionTopic(session) !== topic || card.state !== "passed" || card.lastCheckedVersion !== card.contentVersion) return [];
    let labels = new Map<string, string>();
    try { labels = new Map(cardSlots(cardRequirements(card)).map((slot) => [slot.key, slot.label])); } catch { /* The question version is gone; the points still read without labels. */ }
    const points = card.content.parts.filter((part) => part.text.trim()).slice(0, 4).map((part) => ({ label: labels.get(part.key) ?? "", text: part.text.trim() }));
    return points.length ? [{ id: row.attemptId, question: session.question?.text ?? session.prompt.text, points, updatedAt: card.updatedAt }] : [];
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3).map(({ id, question, points }) => ({ id, question, points }));
  const all = reviewItems(sessions.filter((s) => s.id !== current.id)).flatMap((item) => (item.kind === "phrase" ? [item] : []));
  const phrases = [...all.filter((item) => item.topic === topic), ...all.filter((item) => item.topic !== topic)].slice(0, 6).map((item) => ({ id: item.id, prompt: item.prompt, answer: item.answer }));
  return { habits, cards, phrases };
}
