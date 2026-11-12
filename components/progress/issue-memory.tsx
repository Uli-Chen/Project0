"use client";

import { RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MemoryItem } from "@/lib/prototype/types";

/** 来自作文反馈的常见问题；移除后不再用于推荐重点，可以恢复 */
export function IssueMemory({ initial, excludedMemoryIds }: { initial: MemoryItem[]; excludedMemoryIds: string[] }) {
  const [items, setItems] = useState(initial);
  const [excluded, setExcluded] = useState(excludedMemoryIds);
  const [busy, setBusy] = useState<string | null>(null);
  const issues = items.filter((item) => item.kind === "thinking");
  const active = issues.filter((item) => !item.deleted).sort((a, b) => b.seen - a.seen);
  const removed = issues.filter((item) => item.deleted);
  const notes = items.filter((item) => item.kind !== "thinking" && !item.deleted);

  async function change(id: string, remove: boolean) {
    if (busy) return;
    setBusy(id);
    const next = remove ? [...new Set([...excluded, id])] : excluded.filter((entry) => entry !== id);
    try {
      const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ excludedMemoryIds: next }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "保存失败，请重试。");
      setExcluded(next);
      setItems((list) => list.map((item) => item.id === id ? { ...item, deleted: remove } : item));
      toast(remove ? "已移除" : "已恢复", remove ? { action: { label: "撤销", onClick: () => void change(id, false) } } : undefined);
    } catch (error) { toast.error(error instanceof Error ? error.message : "网络连接失败，请重试。"); }
    finally { setBusy(null); }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div className="min-w-0">
        {active.length === 0 ? <p className="py-10 text-sm text-muted-foreground">评估后的问题会出现在这里</p> : (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-0">问题</TableHead>
                <TableHead className="w-24 text-right">出现</TableHead>
                <TableHead className="hidden w-24 text-right sm:table-cell">最近</TableHead>
                <TableHead className="w-10 pr-0" aria-hidden />
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.map((item) => (
                <TableRow key={item.id} className="group">
                  <TableCell className="pl-0 whitespace-normal">
                    <p className="font-medium">{item.summary}</p>
                    {item.evidence && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{item.evidence.sentence}</p>}
                  </TableCell>
                  <TableCell className="text-right text-[14px] tabular-nums">{item.seen}<span className="text-muted-foreground"> / {item.checked}</span></TableCell>
                  <TableCell className="meta hidden text-right sm:table-cell">{item.evidence?.date}</TableCell>
                  <TableCell className="pr-0 text-right">
                    <Tooltip>
                      <TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`移除：${item.summary}`} disabled={busy !== null} onClick={() => change(item.id, true)} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" />}><X /></TooltipTrigger>
                      <TooltipContent>不再用于推荐重点</TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {removed.length > 0 && (
          <details className="mt-6 text-sm">
            <summary className="w-fit cursor-pointer text-xs text-muted-foreground hover:text-foreground">已移除 {removed.length}</summary>
            <ul className="mt-3 flex flex-col divide-y border-y">
              {removed.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 py-2"><span className="text-muted-foreground">{item.summary}</span><Button size="xs" variant="ghost" disabled={busy !== null} onClick={() => change(item.id, false)}><RotateCcw />恢复</Button></li>)}
            </ul>
          </details>
        )}
      </div>
      <aside>
        <h3 className="text-xs text-muted-foreground">偏好与难点</h3>
        {notes.length ? <ul className="mt-2.5 flex flex-col gap-2 text-[14px]">{notes.map((item) => <li key={item.id}>{item.summary}</li>)}</ul> : <p className="mt-2.5 text-[14px] text-muted-foreground">未填写</p>}
        <Link href="/onboarding" className="mt-3 inline-block text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">修改</Link>
      </aside>
    </div>
  );
}
