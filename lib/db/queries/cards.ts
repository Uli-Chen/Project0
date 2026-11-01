import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "../client";
import { questions, topicCards } from "../schema";
import { cardContentSchema } from "../../quick/schemas";
import { requirementSchema } from "../../question-bank/types";
import { SessionError } from "../../pipeline/engine";

export function getCard(userId: string, attemptId: string) {
  const row = getDb().select().from(topicCards).where(and(eq(topicCards.userId, userId), eq(topicCards.attemptId, attemptId))).get();
  if (!row) return null;
  const { contentJson, ...card } = row;
  return { ...card, content: cardContentSchema.parse(JSON.parse(contentJson)) };
}
export type TopicCard = NonNullable<ReturnType<typeof getCard>>;
export function cardRequirements(card: Pick<TopicCard, "questionId" | "questionVersion">) {
  const row = getDb().select().from(questions).where(and(eq(questions.id, card.questionId), eq(questions.version, card.questionVersion))).get();
  if (!row) throw new SessionError("找不到这份卡片对应的题目版本。", 409, "unsupported_session");
  return requirementSchema.parse(JSON.parse(row.requirementsJson));
}
