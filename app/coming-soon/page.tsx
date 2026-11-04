import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { DeveloperAccess } from "@/components/preview/developer-access";
import { Wordmark } from "@/components/shell/wordmark";
import { hasPreviewAccess, PREVIEW_COOKIE } from "@/lib/preview/access";

export const dynamic = "force-dynamic";

// Logged-out visitors to / are redirected here (see proxy.ts). Keep it free of product details.
export const metadata: Metadata = { title: { absolute: "project 0" }, description: "Coming soon." };

export default async function ComingSoonPage() {
  const access = hasPreviewAccess((await cookies()).get(PREVIEW_COOKIE)?.value);
  return (
    <div lang="en" className="flex min-h-dvh flex-col bg-white text-[#15171a] [color-scheme:light]">
      <header className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-6 sm:px-8">
        <span className="[&_a]:text-[#15171a]"><Wordmark /></span>
        <Link href="/login" className="inline-flex h-9 items-center rounded-full px-4 text-[15px] font-medium hover:bg-[#f5f6f7]">Log in</Link>
      </header>
      <main className="mx-auto flex w-full max-w-[1200px] flex-1 items-center px-6 sm:px-8">
        <h1 className="text-[clamp(56px,10vw,144px)] font-medium leading-[0.95] tracking-[-0.045em]">Coming soon.</h1>
      </main>
      <footer className="mx-auto flex w-full max-w-[1200px] flex-wrap items-end justify-between gap-6 px-6 pt-10 pb-10 sm:px-8">
        <p className="text-[15px] text-[#50565f]">© 2026 auglearn.org</p>
        <DeveloperAccess hasAccess={access} />
      </footer>
    </div>
  );
}
