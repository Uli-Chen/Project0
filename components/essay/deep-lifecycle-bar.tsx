"use client";
import { Button } from "@/components/ui/button";
import type { SessionState } from "@/lib/pipeline/types";
export function DeepLifecycleBar({ lifecycle, checkpoint, busy, onResume }: {
  lifecycle: SessionState["lifecycle"]; checkpoint: boolean; busy: boolean; onResume: () => void;
}) {
  if (lifecycle === "open") return checkpoint ? <p className="shrink-0 border-b px-4 py-2 text-xs text-muted-foreground">检查点按服务端时间连续计时 40 分钟，暂放或离开页面不会暂停；关闭后再恢复也不会重新取得检查点资格。</p> : null;
  return <div role="status" className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-warn-soft px-4 py-2.5 text-sm">
    <div className="min-w-0 flex-1"><p>{lifecycle === "set_aside" ? "这篇练习已暂放，暂不出现在首页继续入口。" : "这篇练习已关闭，已保存的内容仍可查看。"}</p>
      <p className="mt-1 text-xs text-muted-foreground">恢复后可继续编辑。未发送的教练文字不会随作文保存，请在离开前发送或自行复制。{checkpoint && (lifecycle === "set_aside" ? "检查点计时仍在继续，暂放不会延长截止时间。" : "恢复不会重置检查点时间或资格；仍可继续写作和获得反馈。")}</p></div>
    <Button size="sm" variant="outline" disabled={busy} onClick={onResume}>{busy ? "处理中…" : "恢复练习"}</Button>
  </div>;
}
