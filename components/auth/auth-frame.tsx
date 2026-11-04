import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/shell/wordmark";

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex h-16 max-w-6xl items-center px-6 sm:px-10"><Wordmark /></header>
      <main className="mx-auto w-full max-w-md px-6 pt-6 pb-16 sm:pt-16">
        <div className="surface p-6 sm:p-8">{children}<p className="mt-6 text-center text-xs text-muted-foreground"><Link href="/privacy" className="underline">隐私说明</Link></p></div>
      </main>
    </div>
  );
}
