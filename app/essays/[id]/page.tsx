import { getCard } from "@/lib/db/queries/cards";
import { readQuick } from "@/lib/pipeline/quick";
import { cardRequirements } from "@/lib/db/queries/cards";
import { QuickScreen } from "@/components/quick/quick-screen";
import { CheckpointClock } from "@/components/checkpoints/clock";
import { checkpointHistory } from "@/lib/db/checkpoints";
import { readFeatures } from "@/lib/config/features";
import { notFound } from "next/navigation";
import { SessionView } from "@/components/essay/session-view";
import { requireUser } from "@/lib/auth/server";
import { getSession } from "@/lib/db/queries/sessions";

export default async function EssayPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const session = getSession(user.id, id);
  if (!session) notFound();
  if (readFeatures().QUICK_ENABLED && session.activity === "quick" && session.stage === "quick") {
    const data = readQuick(user.id, id);
    return <QuickScreen initial={data} requirements={cardRequirements(data.card)} />;
  }
  const checkpoint = session.checkpointId ? checkpointHistory(user.id).find(c => c.attemptId === id) : undefined;
  const snapshotRequirements = session.cardSnapshot && session.question ? cardRequirements({ questionId: session.question.id, questionVersion: session.question.version }) : undefined;
  const clock = checkpoint ? <CheckpointClock sessionId={session.id} originalSubmittedAt={session.originalSubmittedAt} deadlineAt={checkpoint.deadlineAt} serverNow={new Date().toISOString()} /> : undefined;
  return <SessionView session={session} banner={clock} cardRequirements={snapshotRequirements} cardContent={session.activity === "quick" ? getCard(user.id, id)?.content : undefined} tutorV2Enabled={readFeatures().TUTOR_V2_ENABLED} questionBankEnabled={readFeatures().QUESTION_BANK_ENABLED} />;
}
