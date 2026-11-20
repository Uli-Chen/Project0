import { redirect } from "next/navigation";
import { readFeatures } from "@/lib/config/features";
import LibraryPage from "@/components/library/library-page";

/** With the question bank on, essays are listed on the practice page; the old address keeps working. */
export default function EssaysPage() {
  if (readFeatures().QUESTION_BANK_ENABLED) redirect("/practice");
  return <LibraryPage />;
}
