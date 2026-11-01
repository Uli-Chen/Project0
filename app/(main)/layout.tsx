import { readFeatures } from "@/lib/config/features";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Wordmark } from "@/components/shell/wordmark";
import { requireUser } from "@/lib/auth/server";
import { listSessions } from "@/lib/db/queries/sessions";
import { learningSummary } from "@/lib/learning/summary";

export default async function MainLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const { focus } = learningSummary(listSessions(user.id), user.profile);
  const open = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    <SidebarProvider defaultOpen={open}>
      <AppSidebar bankEnabled={readFeatures().QUESTION_BANK_ENABLED} quickEnabled={readFeatures().QUICK_ENABLED} user={{ name: user.name, email: user.email }} focus={readFeatures().QUESTION_BANK_ENABLED ? undefined : focus?.title} />
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-3 md:hidden"><SidebarTrigger /><Wordmark /></header>
        <main id="main-content" className="mx-auto w-full max-w-[1120px] px-5 pt-8 pb-24 sm:px-8 lg:pt-10">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
