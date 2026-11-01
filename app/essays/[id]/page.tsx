import { notFound } from "next/navigation";
import { EssayScreen } from "@/components/essay/essay-screen";
import { requireUser } from "@/lib/auth/server";
import { getSession } from "@/lib/db/queries/sessions";
import { SessionProvider } from "@/lib/prototype/session-store";

export default async function EssayPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const session = getSession(user.id, id);
  if (!session) notFound();
  return <SessionProvider key={id} initialState={session}><EssayScreen /></SessionProvider>;
}
