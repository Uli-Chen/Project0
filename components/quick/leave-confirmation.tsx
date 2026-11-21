"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

/** An in-page confirmation keeps the draft intact until an explicit choice. */
export function LeaveConfirmation({ answerOnly = false, disabled = false, onCancel, onLeave }: { answerOnly?: boolean; disabled?: boolean; onCancel(): void; onLeave(): void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancel.current?.focus(); }, []);
  return <section role="alertdialog" aria-labelledby="quick-leave-title" aria-describedby="quick-leave-description" className="motion-reveal my-4 rounded-xl border border-warn bg-sheet p-5" onKeyDown={e => { if (e.key === "Escape") onCancel(); }}>
    <h2 id="quick-leave-title" className="font-medium">{answerOnly ? "回答尚未发送" : "还有未保存的内容"}</h2>
    <p id="quick-leave-description" className="mt-2 text-sm text-muted-foreground">{answerOnly ? "卡片会先保存。尚未发送的回答不会带入作文，确定放弃这段回答并打开作文？" : "离开会放弃未保存的卡片修改和未发送的回答。已保存的内容会保留。"}</p>
    <div className="mt-4 flex flex-wrap gap-3"><Button ref={cancel} variant="outline" disabled={disabled} onClick={onCancel}>继续编辑</Button><Button disabled={disabled} onClick={onLeave}>{answerOnly ? "放弃未发送回答并打开作文" : "放弃未保存并离开"}</Button></div>
  </section>;
}
