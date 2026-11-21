"use client";

import { ChevronDown, RotateCcw, X } from "lucide-react";
import { useRef, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MemoryItem } from "@/lib/prototype/types";

const TOP = 8;

/** 来自作文反馈的常见问题；移除后不再用于推荐重点，可以恢复 */
export function IssueMemory({ initial, excludedMemoryIds }: { initial: MemoryItem[]; excludedMemoryIds: string[] }) {
  const [excluded, setExcluded] = useState(excludedMemoryIds);
  // An undo toast can be clicked long after other removals; it must change only its own item, so
  // every change starts from the latest saved list, not the one captured when the toast was made.
  const latest = useRef(excludedMemoryIds);
  const [busy, setBusy] = useState<string | null>(null);
  const items = initial.map((item) => ({ ...item, deleted: excluded.includes(item.id) }));
  const issues = items.filter((item) => item.kind === "thinking");
  const active = issues.filter((item) => !item.deleted).sort((a, b) => b.seen - a.seen);
  const removed = issues.filter((item) => item.deleted);
  // Sorted by how often they appear; the long tail stays out of the way until asked for.
  const [showAll, setShowAll] = useState(false);
  const listed = showAll ? active : active.slice(0, TOP);

  const pending = useRef(false);

  async function change(id: string, remove: boolean) {
    if (pending.current) return;
    pending.current = true;
    setBusy(id);
    const next = remove ? [...new Set([...latest.current, id])] : latest.current.filter((entry) => entry !== id);
    try {
      const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ excludedMemoryIds: next }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "保存失败，请重试。");
      const saved: unknown = data.user?.profile?.excludedMemoryIds;
      latest.current = Array.isArray(saved) ? saved.filter((entry): entry is string => typeof entry === "string") : next;
      setExcluded(latest.current);
      toast(remove ? "已移除" : "已恢复", remove ? { action: { label: "撤销", onClick: () => void change(id, false) } } : undefined);
    } catch (error) { toast.error(error instanceof Error ? error.message : "网络连接失败，请重试。"); }
    finally { pending.current = false; setBusy(null); }
  }

  return (
    <div>
      <div className="min-w-0">
        {active.length === 0 ? <p className="py-10 text-sm text-muted-foreground">评估后的问题会出现在这里</p> : (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 pl-0 text-[13px] font-normal text-muted-foreground">问题</TableHead>
                <TableHead className="h-9 w-24 text-right text-[13px] font-normal text-muted-foreground">出现</TableHead>
                <TableHead className="hidden h-9 w-24 text-right text-[13px] font-normal text-muted-foreground sm:table-cell">最近</TableHead>
                <TableHead className="w-10 pr-0" aria-hidden />
              </TableRow>
            </TableHeader>
            <TableBody>
              {listed.map((item, index) => (
                <TableRow key={item.id} className="motion-reveal group" style={{ "--i": index } as CSSProperties}>
                  <TableCell className="pl-0 whitespace-normal">
                    <p className="font-medium">{item.summary}</p>
                    {item.evidence && <p className="mt-1 line-clamp-1 text-[14px] text-muted-foreground">{item.evidence.sentence}</p>}
                  </TableCell>
                  <TableCell className="text-right text-[14px] tabular-nums">{item.seen}<span className="text-muted-foreground"> / {item.checked}</span></TableCell>
                  <TableCell className="meta hidden text-right sm:table-cell">{item.evidence?.date}</TableCell>
                  <TableCell className="pr-0 text-right">
                    <Tooltip>
                      <TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`移除：${item.summary}`} disabled={busy !== null} onClick={() => change(item.id, true)} className="opacity-0 transition-opacity duration-(--dur-fast) group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100" />}><X /></TooltipTrigger>
                      <TooltipContent>不再用于推荐重点</TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {active.length > TOP && <button type="button" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)} className="mt-2 -ml-3 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[14px] text-muted-foreground transition-colors duration-(--dur-fast) hover:bg-sunk hover:text-foreground">{showAll ? "只看最常见的" : `显示全部 ${active.length} 个`}<ChevronDown className={`size-4 transition-transform duration-(--dur-layout) ease-(--ease-soft) ${showAll ? "rotate-180" : ""}`} aria-hidden /></button>}
        {removed.length > 0 && (
          <Collapsible className="mt-6 text-sm">
            <CollapsibleTrigger className="group -ml-1 inline-flex w-fit items-center gap-1 rounded-md px-1 py-0.5 text-[14px] text-muted-foreground transition-colors duration-(--dur-fast) select-none hover:text-foreground">
              <ChevronDown aria-hidden className="size-3.5 transition-transform duration-(--dur-layout) ease-(--ease-soft) group-data-panel-open:-rotate-180" />已移除 {removed.length}
            </CollapsibleTrigger>
            <CollapsibleContent><ul className="mt-3 flex flex-col divide-y border-y">
              {removed.map((item) => <li key={item.id} className="motion-reveal flex items-center justify-between gap-3 py-2"><span className="text-muted-foreground line-through decoration-border">{item.summary}</span><Button size="xs" variant="ghost" disabled={busy !== null} onClick={() => change(item.id, false)}><RotateCcw />恢复</Button></li>)}
            </ul></CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  );
}
