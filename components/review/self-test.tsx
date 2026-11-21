"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Self-test for one library item that is due: cover the answer, let the learner try from memory,
 * uncover it, and record whether they had it. The schedule is the server's (/api/review); this only
 * reports the grade, with one key per attempt so a retry never grades twice.
 */
export function SelfTest({ id, due, inset = false, children }: { id: string; due: boolean; inset?: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "covered" | "revealed" | "saving">("idle");
  const [error, setError] = useState("");
  const key = useRef("");

  async function grade(result: "good" | "again") {
    setStep("saving"); setError("");
    try {
      const response = await fetch("/api/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, result, key: key.current }) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(typeof data.error === "string" ? data.error : "没有记下来，请再试一次。"); }
      setStep("idle");
      router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "网络连接失败，请重试。"); setStep("revealed"); }
  }

  if (step === "covered") return (
    <div className={cn("motion-swap flex flex-wrap items-center justify-between gap-3 bg-sunk px-3.5 py-3 font-sans", !inset && "rounded-lg")}>
      <p className="text-[14px] text-muted-foreground">先自己想一遍，再揭开</p>
      <Button size="sm" variant="outline" autoFocus onClick={() => setStep("revealed")}>揭开</Button>
    </div>
  );
  return (
    <>
      {children}
      {step === "idle" && due && <div className={cn(inset ? "px-2 py-1.5" : "mt-2.5 -ml-2.5")}><button type="button" onClick={() => { key.current = crypto.randomUUID(); setError(""); setStep("covered"); }} className="inline-flex h-7 items-center rounded-full px-2.5 font-sans text-[14px] font-medium text-primary transition-colors duration-(--dur-fast) hover:bg-coach-soft">自测一下</button></div>}
      {(step === "revealed" || step === "saving") && (
        <div className={cn("motion-reveal flex flex-wrap items-center gap-2 font-sans", inset ? "px-4 py-2.5" : "mt-3")}>
          <span className="mr-1 text-[14px] text-muted-foreground">刚才想到了吗？</span>
          <Button size="sm" variant="outline" disabled={step === "saving"} onClick={() => void grade("good")}>记得</Button>
          <Button size="sm" variant="ghost" disabled={step === "saving"} onClick={() => void grade("again")}>再来</Button>
        </div>
      )}
      {error && <p role="alert" className={cn("motion-reveal font-sans text-[14px] text-destructive", inset ? "px-4 pb-2.5" : "mt-2")}>{error}</p>}
    </>
  );
}
