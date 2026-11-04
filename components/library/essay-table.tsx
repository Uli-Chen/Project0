"use client";

import { matchesEssayFilter } from "@/lib/learning/library";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { EssayStatus } from "@/lib/learning/summary";

export type EssayRow = {
  id: string;
  prompt: string;
  kind: string;
  status: EssayStatus;
  completed: boolean;
  lifecycle: string;
  statusLabel: string;
  original: number | null;
  revision: number | null;
  date: string;
};

const DOT: Record<EssayStatus, string> = {
  drafting: "bg-muted-foreground/50",
  evaluating: "bg-coach animate-pulse",
  evaluated: "bg-foreground",
  revising: "bg-warn",
  done: "bg-good",
};

export function EssayTable({ rows }: { rows: EssayRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const visible = rows.filter((row) => matchesEssayFilter(row, filter));
  const counts = { all: rows.length, active: rows.filter((row) => matchesEssayFilter(row, "active")).length, done: rows.filter((row) => row.completed).length };

  return (
    <div className="surface overflow-hidden">
      <Tabs value={filter} onValueChange={(value) => setFilter(String(value))}>
        <TabsList variant="line" className="w-full justify-start gap-5 rounded-none border-b px-5 group-data-horizontal/tabs:h-12">
          {([["all", "全部"], ["active", "进行中"], ["done", "已完成"]] as const).map(([value, label]) => (
            <TabsTrigger key={value} value={value} className="flex-none px-0 text-sm group-data-horizontal/tabs:after:bottom-[-7px] after:bg-foreground">{label}<span className="text-xs font-normal text-faint tabular-nums">{counts[value]}</span></TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">没有{filter === "done" ? "已完成" : "进行中"}的作文</p>
      ) : (
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="bg-sunk/60 hover:bg-sunk/60">
              <TableHead className="w-auto pl-5">题目</TableHead>
              <TableHead className="hidden w-20 sm:table-cell">类型</TableHead>
              <TableHead className="w-28 sm:w-36">状态</TableHead>
              <TableHead className="w-24 text-right">分数<span className="block text-[11px] font-normal text-faint">AI 实验性预估</span></TableHead>
              <TableHead className="hidden w-20 text-right md:table-cell">更新</TableHead>
              <TableHead className="w-10 pr-5" aria-hidden />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={row.id} onClick={() => router.push(`/essays/${row.id}`)} className="group h-15 cursor-pointer hover:bg-[color-mix(in_oklch,var(--sheet),var(--primary)_4%)]">
                <TableCell className="pl-5">
                  <Link href={`/essays/${row.id}`} onClick={(event) => event.stopPropagation()} className="block truncate font-serif text-[16px] text-foreground outline-none focus-visible:underline">{row.prompt}</Link>
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">{row.kind}{row.kind === "练习" && <span className="block text-[11px] text-faint">有辅导</span>}</TableCell>
                <TableCell><span className="inline-flex items-center gap-2"><span className={cn("size-1.5 rounded-full", DOT[row.status])} aria-hidden />{row.statusLabel}</span></TableCell>
                <TableCell className="text-right text-sm font-medium tabular-nums">
                  {row.original === null ? <span className="text-muted-foreground">—</span> : row.revision === null ? row.original.toFixed(1) : <><span className="text-muted-foreground">{row.original.toFixed(1)} → </span>{row.revision.toFixed(1)}</>}
                </TableCell>
                <TableCell className="meta hidden text-right md:table-cell">{row.date}</TableCell>
                <TableCell className="pr-5 text-right"><ArrowRight className="ml-auto size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
