"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { DrawnCheck } from "@/components/ui/status-button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/lib/prototype/session-store";
import type { MemoryChange } from "@/lib/prototype/types";
import { cn } from "@/lib/utils";

const TONE: Record<MemoryChange["kind"], string> = {
  new: "bg-foreground/50",
  recurring: "bg-warn",
  improving: "bg-good",
  resolved: "bg-good",
  idea: "bg-coach",
};

/** 本篇小结：完成后常驻在反馈或对比面板顶部 */
export function FinishSummary({ animate = false }: { animate?: boolean } = {}) {
  const { state, questionBankEnabled } = useSession();
  if (!state.finish) return null;
  return (
    <section className="rounded-xl bg-good-soft p-4">
      <h2 className="flex items-center gap-1.5 text-[15px] font-semibold">{animate && <DrawnCheck className="text-good" />}本篇小结</h2>
      <ul className="mt-2.5 flex flex-col gap-2">
        {state.finish.memoryChanges.map((change, i) => (
          <li key={change.text} className={cn("flex items-baseline gap-2.5 text-[14px] leading-relaxed", animate && "motion-reveal")} style={animate ? { "--i": i + 1 } as React.CSSProperties : undefined}>
            <span className={cn("size-1.5 shrink-0 translate-y-[-2px] rounded-full", TONE[change.kind])} aria-hidden />
            {change.text}
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t pt-3 text-[14px] leading-relaxed"><Link href={questionBankEnabled && state.question ? `/topics/${state.question.primaryTopic}` : "/"}>下一步 · {questionBankEnabled && state.question ? "回到本题主题" : "回到首页"}</Link></p>
    </section>
  );
}

/** 刚完成时弹出一次 */
export function FinishDialog() {
  const { state } = useSession();
  const [open, setOpen] = useState(false);
  const previous = useRef(state.stage);
  useEffect(() => {
    if (previous.current !== "finished" && state.stage === "finished" && state.finish) setOpen(true);
    previous.current = state.stage;
  }, [state.stage, state.finish]);
  const assessment = state.kind === "assessment";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{assessment ? "入门测试完成" : "完成"}</DialogTitle></DialogHeader>
        <FinishSummary animate />
        <DialogFooter>
          <button type="button" onClick={() => setOpen(false)} className={buttonVariants({ variant: "ghost" })}>留在此页</button>
          <Link href={assessment ? "/progress" : "/essays"} className={buttonVariants()}>{assessment ? "查看进展" : "回到练习"}</Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
