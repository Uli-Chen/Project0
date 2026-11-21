import { readFeatures } from "@/lib/config/features";
import { cookies } from "next/headers";
import type { CSSProperties, ReactNode } from "react";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Wordmark } from "@/components/shell/wordmark";
import { requireUser } from "@/lib/auth/server";
import { listSessions } from "@/lib/db/queries/sessions";
import { learningSummary } from "@/lib/learning/summary";

export default async function MainLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const sessions = listSessions(user.id);
  const { focus } = learningSummary(sessions, user.profile);
  const flags = readFeatures();
  const open = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    <SidebarProvider defaultOpen={open} style={{ "--sidebar-width": "15rem" } as CSSProperties}>
      <AppSidebar bankEnabled={flags.QUESTION_BANK_ENABLED} checkpointsEnabled={flags.CHECKPOINTS_ENABLED} user={{ name: user.name, email: user.email }} focus={flags.QUESTION_BANK_ENABLED ? undefined : focus?.title} />
      <SidebarInset className="md:peer-data-[variant=inset]:rounded-2xl md:peer-data-[variant=inset]:shadow-none">
        {/* The sheet's frame: it stays in the window while the page scrolls under it, so the window itself still scrolls. */}
        <div aria-hidden className="pointer-events-none sticky top-2 z-20 -mb-[calc(100svh-1rem)] hidden h-[calc(100svh-1rem)] shrink-0 rounded-2xl shadow-frame md:block" />
        <header className="flex h-14 items-center gap-2 border-b px-4 md:hidden"><SidebarTrigger /><Wordmark /></header>
        <main id="main-content" className="mx-auto w-full max-w-[1040px] px-5 pt-8 pb-24 sm:px-10 lg:pt-11">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
