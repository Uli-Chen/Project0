import type { QuestionRequirements } from "@/lib/question-bank/types";
import type { CardContent } from "@/lib/quick/schemas";
import { isSupportedSession } from "@/lib/pipeline/read-session";
import type { SessionState } from "@/lib/pipeline/types";
import { SessionProvider } from "@/lib/prototype/session-store";
import { EssayScreen } from "./essay-screen";
import { ReadonlySession } from "./readonly-session";

/** Server boundary: unsupported sessions never mount the editing controller. */
export function SessionView({ session, tutorV2Enabled = false, questionBankEnabled = false, cardContent, cardRequirements }: { session: SessionState; tutorV2Enabled?: boolean; questionBankEnabled?: boolean; cardContent?: CardContent | null; cardRequirements?: QuestionRequirements }) {
  if (!isSupportedSession(session)) return <ReadonlySession session={session} cardContent={cardContent} />;
  return <SessionProvider key={session.id} initialState={session} tutorV2Enabled={tutorV2Enabled} questionBankEnabled={questionBankEnabled}><EssayScreen cardRequirements={cardRequirements} /></SessionProvider>;
}
