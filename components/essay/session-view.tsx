import { isSupportedSession } from "@/lib/pipeline/read-session";
import type { SessionState } from "@/lib/pipeline/types";
import { SessionProvider } from "@/lib/prototype/session-store";
import { EssayScreen } from "./essay-screen";
import { ReadonlySession } from "./readonly-session";

/** Server boundary: unsupported sessions never mount the editing controller. */
export function SessionView({ session, questionBankEnabled = false }: { session: SessionState; questionBankEnabled?: boolean }) {
  if (!isSupportedSession(session)) return <ReadonlySession session={session} />;
  return <SessionProvider key={session.id} initialState={session} questionBankEnabled={questionBankEnabled}><EssayScreen /></SessionProvider>;
}
