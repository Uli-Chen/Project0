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
import { getSession } from "@/lib/db/queries/sessions";

export default async function EssayPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const session = getSession(user.id, id);
  if (!session) notFound();
  if (readFeatures().QUICK_ENABLED && session.activity === "quick" && session.stage === "quick") {
    const data = readQuick(user.id, id);
    return <QuickScreen initial={quickSessionDetail(data)} requirements={cardRequirements(data.card)} />;
  }
  const checkpoint = session.checkpointId ? sessionCheckpoint(user.id, id) : undefined;
  const snapshotRequirements = session.cardSnapshot && session.question ? cardRequirements({ questionId: session.question.id, questionVersion: session.question.version }) : undefined;
  const timing = checkpoint && checkpoint.status !== "abandoned" ? { deadlineAt: checkpoint.deadlineAt, serverNow: new Date().toISOString() } : undefined;
  return <SessionView session={sessionDetail(session)} timing={timing} cardRequirements={snapshotRequirements} cardContent={session.activity === "quick" ? getCard(user.id, id)?.content : undefined} tutorV2Enabled={readFeatures().TUTOR_V2_ENABLED} questionBankEnabled={readFeatures().QUESTION_BANK_ENABLED} />;
}
