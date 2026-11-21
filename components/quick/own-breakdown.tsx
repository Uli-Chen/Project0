"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * 自己审题: before the bank's breakdown of a multi-part question is shown, the learner writes what
 * they think the question asks. It is their own view, kept only on this page for the comparison;
 * nothing is graded and the step can be skipped.
 */
export function OwnBreakdown({ storageKey, parts, children }: { storageKey: string; parts: string[]; children: React.ReactNode }) {
  const [text, setText] = useState("");
  // null until this tab's storage has been read, so the server and the first client render agree.
  const [mine, setMine] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads this tab's storage once after mount
    try { setMine(sessionStorage.getItem(storageKey)); } catch { setMine(null); }
  }, [storageKey]);
  const reveal = (own: string) => { try { sessionStorage.setItem(storageKey, own); } catch { /* The comparison is a convenience; without storage it simply is not kept. */ } setMine(own); };
  const shown = typeof mine === "string";
  const own = shown ? mine : "";

  if (mine === undefined) return null;
  if (!shown) return (
    <section aria-label="自己审题" className="motion-reveal mt-9 border-t pt-8">
      <h2 className="text-[17px] font-semibold">先自己拆一下：这道题要回答哪几件事？</h2>
      <p className="mt-1 text-[14px] text-muted-foreground">一行写一件，中英文都可以。写完再对照题库的拆解。</p>
      <textarea value={text} onChange={(event) => setText(event.target.value)} rows={3} maxLength={600} aria-label="我认为这道题要回答的事" className="mt-4 w-full rounded-lg border border-input bg-sheet px-3 py-2 text-[15px] leading-relaxed transition-[border-color,box-shadow] duration-(--dur-standard) outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!text.trim()} onClick={() => reveal(text.trim())}>对照题库的拆解</Button>
        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => reveal("")}>跳过</Button>
      </div>
    </section>
  );
  return (
    <>
      {own && (
        <section aria-label="审题对照" className="motion-reveal mt-9 grid gap-4 rounded-xl bg-sunk p-4 sm:grid-cols-2">
          <div><h2 className="text-[14px] text-muted-foreground">你的拆解</h2><p className="mt-1.5 text-[15px] leading-relaxed whitespace-pre-wrap">{own}</p></div>
          <div><h2 className="text-[14px] text-muted-foreground">题库的拆解</h2><ol className="mt-1.5 flex list-decimal flex-col gap-1 pl-5 text-[15px] leading-relaxed">{parts.map((part) => <li key={part}>{part}</li>)}</ol></div>
        </section>
      )}
      {children}
    </>
  );
}
