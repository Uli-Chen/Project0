import type { CheckpointTiming } from "@/components/checkpoints/clock";
import type { QuestionRequirements } from "@/lib/question-bank/types";
import type { CardContent } from "@/lib/quick/schemas";
import { isSupportedSession } from "@/lib/pipeline/read-session";
import type { SessionDetail } from "@/lib/pipeline/session-detail";
import { SessionProvider } from "@/lib/prototype/session-store";
import type { Recall } from "@/lib/learning/recall";
import { EssayScreen } from "./essay-screen";
import { ReadonlySession } from "./readonly-session";

/** Server boundary: unsupported sessions never mount the editing controller. */
export function SessionView({ session, recall, tutorV2Enabled = false, questionBankEnabled = false, cardContent, cardRequirements, timing }: { session: SessionDetail; tutorV2Enabled?: boolean; questionBankEnabled?: boolean; cardContent?: CardContent | null; cardRequirements?: QuestionRequirements; timing?: CheckpointTiming; recall?: Recall }) {
  if (!isSupportedSession(session)) {
    return <ReadonlySession session={session} cardContent={cardContent} />;
  }
  return <SessionProvider key={session.id} initialState={session} tutorV2Enabled={tutorV2Enabled} questionBankEnabled={questionBankEnabled}><EssayScreen cardRequirements={cardRequirements} timing={timing} recall={recall} /></SessionProvider>;
}
