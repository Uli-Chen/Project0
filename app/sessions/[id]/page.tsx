import { redirect } from "next/navigation";

export default async function LegacySessionPage({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/essays/${(await params).id}`);
}
