import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/shell/wordmark";
import { privacyNoticeVisible } from "@/lib/config/features";

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="mx-auto flex h-16 max-w-6xl items-center px-6 sm:px-10"><Wordmark /></header>
      <main className="mx-auto w-full max-w-md px-6 pt-6 pb-16 sm:pt-16">
        <div className="motion-enter rounded-2xl bg-background p-6 shadow-sheet sm:p-8" style={{ "--i": 0 } as React.CSSProperties}>{children}{privacyNoticeVisible() && <p className="mt-6 text-center text-[14px] text-muted-foreground"><Link href="/privacy" className="underline">隐私说明</Link></p>}</div>
      </main>
    </div>
  );
}
