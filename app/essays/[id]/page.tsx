import { notFound } from "next/navigation";
import { SessionView } from "@/components/essay/session-view";
import { requireUser } from "@/lib/auth/server";
import { getSession } from "@/lib/db/queries/sessions";

export default async function EssayPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const session = getSession(user.id, id);
  if (!session) notFound();
  return <SessionView session={session} />;
}
