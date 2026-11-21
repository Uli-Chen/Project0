import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { topicCards } from "@/lib/db/schema";
import { getCard } from "@/lib/db/queries/cards";
import { readQuick } from "@/lib/pipeline/quick";
import { quickSessionDetail, sessionDetail } from "@/lib/pipeline/session-detail";
import { cardRequirements } from "@/lib/db/queries/cards";
import { QuickScreen } from "@/components/quick/quick-screen";
import { sessionCheckpoint } from "@/lib/db/checkpoints";
import { readFeatures } from "@/lib/config/features";
import { notFound } from "next/navigation";
import { SessionView } from "@/components/essay/session-view";
import { requireUser } from "@/lib/auth/server";
import { getSession, listSessions } from "@/lib/db/queries/sessions";
import { learnerRecall } from "@/lib/learning/recall";

export default async function EssayPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const session = getSession(user.id, id);
  if (!session) notFound();
  if (readFeatures().QUICK_ENABLED && session.activity === "quick" && session.stage === "quick") {
    const data = readQuick(user.id, id);
    // 自己审题 is offered once the learner has passed a couple of cards and knows what a breakdown looks like.
    const passedCards = getDb().select().from(topicCards).where(eq(topicCards.userId, user.id)).all().filter((card) => card.state === "passed").length;
    return <QuickScreen initial={quickSessionDetail(data)} requirements={cardRequirements(data.card)} ownBreakdown={passedCards >= 2} />;
  }
  const checkpoint = session.checkpointId ? sessionCheckpoint(user.id, id) : undefined;
  const snapshotRequirements = session.cardSnapshot && session.question ? cardRequirements({ questionId: session.question.id, questionVersion: session.question.version }) : undefined;
  const timing = checkpoint && checkpoint.status !== "abandoned" ? { deadlineAt: checkpoint.deadlineAt, serverNow: new Date().toISOString() } : undefined;
  // The learner's own recurring problems, cards and expressions are offered in practice only; a mock is unaided.
  const recall = session.mode === "practice" ? learnerRecall(user.id, user.profile, listSessions(user.id), session) : undefined;
  return <SessionView session={sessionDetail(session)} recall={recall} timing={timing} cardRequirements={snapshotRequirements} cardContent={session.activity === "quick" ? getCard(user.id, id)?.content : undefined} tutorV2Enabled={readFeatures().TUTOR_V2_ENABLED} questionBankEnabled={readFeatures().QUESTION_BANK_ENABLED} />;
}
