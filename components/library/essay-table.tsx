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
    <div>
      <Tabs value={filter} onValueChange={(value) => setFilter(String(value))}>
        <TabsList variant="line" className="h-9 gap-4 border-b w-full justify-start rounded-none px-0">
          {([["all", "全部"], ["active", "进行中"], ["done", "已完成"]] as const).map(([value, label]) => (
            <TabsTrigger key={value} value={value} className="flex-none px-0 after:bg-foreground">{label}<span className="meta">{counts[value]}</span></TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">没有{filter === "done" ? "已完成" : "进行中"}的作文</p>
      ) : (
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-auto pl-0">题目</TableHead>
              <TableHead className="hidden w-20 sm:table-cell">类型</TableHead>
              <TableHead className="w-28 sm:w-36">状态</TableHead>
              <TableHead className="w-24 text-right">分数<span className="block text-[10px] font-normal text-muted-foreground">AI 实验性预估</span></TableHead>
              <TableHead className="hidden w-20 text-right md:table-cell">更新</TableHead>
              <TableHead className="w-8 pr-0" aria-hidden />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={row.id} onClick={() => router.push(`/essays/${row.id}`)} className="group h-14 cursor-pointer">
                <TableCell className="pl-0">
                  <Link href={`/essays/${row.id}`} onClick={(event) => event.stopPropagation()} className="block truncate font-serif text-[15px] text-foreground outline-none focus-visible:underline">{row.prompt}</Link>
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">{row.kind}{row.kind === "练习" && <span className="block text-[10px]">有辅导</span>}</TableCell>
                <TableCell><span className="inline-flex items-center gap-2"><span className={cn("size-1.5 rounded-full", DOT[row.status])} aria-hidden />{row.statusLabel}</span></TableCell>
                <TableCell className="text-right font-mono text-[13px] tabular-nums">
                  {row.original === null ? <span className="text-muted-foreground">—</span> : row.revision === null ? row.original.toFixed(1) : <><span className="text-muted-foreground">{row.original.toFixed(1)} → </span>{row.revision.toFixed(1)}</>}
                </TableCell>
                <TableCell className="meta hidden text-right md:table-cell">{row.date}</TableCell>
                <TableCell className="pr-0 text-right"><ArrowRight className="ml-auto size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
