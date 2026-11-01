import type { ReactNode } from "react";
import { Wordmark } from "@/components/shell/wordmark";

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex h-16 max-w-6xl items-center px-6 sm:px-10"><Wordmark /></header>
      <main className="mx-auto w-full max-w-md px-6 pt-6 pb-16 sm:pt-16">
        <div className="rounded-xl border bg-sheet p-6 sm:p-8">{children}</div>
      </main>
    </div>
  );
}
