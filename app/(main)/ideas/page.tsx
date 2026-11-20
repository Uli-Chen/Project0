import { redirect } from "next/navigation";

/** Idea cards are a tab of the review page; the old address opens it with the same filters. */
export default async function IdeasPage({ searchParams }: { searchParams: Promise<{ topic?: string; status?: string }> }) {
  const params = await searchParams;
  const query = new URLSearchParams({ tab: "ideas", ...(params.topic ? { topic: params.topic } : {}), ...(params.status === "all" ? { status: "all" } : {}) });
  redirect(`/cards?${query}`);
}
