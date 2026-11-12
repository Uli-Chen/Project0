"use client";
import { Button } from "@/components/ui/button";
import type { SessionState } from "@/lib/pipeline/types";
/** 暂放或关闭时的状态条。进行中的独立模考由计时条说明计时规则，这里不再重复。 */
export function DeepLifecycleBar({ lifecycle, checkpoint, busy, onResume }: {
  lifecycle: SessionState["lifecycle"]; checkpoint: boolean; busy: boolean; onResume: () => void;
}) {
  if (lifecycle === "open") return null;
  return <div role="status" className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-warn-soft px-4 py-2.5 text-sm">
    <div className="min-w-0 flex-1"><p>{lifecycle === "set_aside" ? "这篇练习已暂放，首页不再提示继续。" : "这篇练习已关闭，已保存的内容仍可查看。"}</p>
      <p className="mt-1 text-sm text-muted-foreground">恢复后可以继续编辑。教练输入框里没发送的文字不会保存。{checkpoint && (lifecycle === "set_aside" ? "独立模考的计时仍在走，暂放不会延长时间。" : "这次独立模考已结束，成绩不会加入趋势；恢复后仍可继续写作并获得反馈。")}</p></div>
    <Button size="sm" variant="outline" disabled={busy} onClick={onResume}>{busy ? "处理中…" : "恢复练习"}</Button>
  </div>;
}
