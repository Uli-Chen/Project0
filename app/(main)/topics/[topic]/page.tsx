import { notFound, redirect } from "next/navigation";
import { readFeatures } from "@/lib/config/features";

/** Topics are a filter on the practice page now; old topic links open it with the topic chosen. */
export default async function TopicPage({ params }: { params: Promise<{ topic: string }> }) {
  if (!readFeatures().QUESTION_BANK_ENABLED) notFound();
  const { topic } = await params;
  redirect(`/practice?topic=${encodeURIComponent(topic)}`);
}
