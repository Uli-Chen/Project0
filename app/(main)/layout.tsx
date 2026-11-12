import { readFeatures } from "@/lib/config/features";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Wordmark } from "@/components/shell/wordmark";
import { requireUser } from "@/lib/auth/server";
import { listSessions } from "@/lib/db/queries/sessions";
import { learningSummary } from "@/lib/learning/summary";
import { dueItems, reviewItems } from "@/lib/learning/review-items";

export default async function MainLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const sessions = listSessions(user.id);
  const { focus } = learningSummary(sessions, user.profile);
  const flags = readFeatures();
  const reviewDue = dueItems(reviewItems(sessions), user.profile.review ?? {}).length;
  const open = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    <SidebarProvider defaultOpen={open}>
      <AppSidebar bankEnabled={flags.QUESTION_BANK_ENABLED} reviewDue={reviewDue} user={{ name: user.name, email: user.email }} focus={flags.QUESTION_BANK_ENABLED ? undefined : focus?.title} />
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4 md:hidden"><SidebarTrigger /><Wordmark /></header>
        <main id="main-content" className="mx-auto w-full max-w-[1080px] px-5 pt-8 pb-28 sm:px-10 lg:pt-14">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
