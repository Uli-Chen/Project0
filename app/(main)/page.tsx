import { readFeatures } from "@/lib/config/features";
import { requireUser } from "@/lib/auth/server";
import LibraryPage from "@/components/library/library-page";
import { TopicHome } from "@/components/topics/home";
export default async function Home(){ const user=await requireUser(); return readFeatures().QUESTION_BANK_ENABLED ? <TopicHome userId={user.id}/> : <LibraryPage/>; }
