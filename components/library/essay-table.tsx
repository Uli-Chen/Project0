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
            <TabsTrigger key={value} value={value} className="flex-none px-0 text-sm group-data-horizontal/tabs:after:bottom-[-7px] after:bg-foreground">{label}<span className="text-[14px] font-normal text-muted-foreground tabular-nums">{counts[value]}</span></TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">没有{filter === "done" ? "已完成" : "进行中"}的作文</p>
      ) : (<>
        {/* Phones: the title gets the whole first line; status, score and date share the second. */}
        <ul className="divide-y sm:hidden">
          {visible.map((row) => (
            <li key={row.id}>
              <Link href={`/essays/${row.id}`} className="block px-5 py-3.5 outline-none hover:bg-[color-mix(in_oklch,var(--sheet),var(--primary)_4%)] focus-visible:bg-[color-mix(in_oklch,var(--sheet),var(--primary)_6%)]">
                <span className="line-clamp-2 font-serif text-[16px] leading-snug text-foreground">{row.prompt}</span>
                <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 text-foreground"><span className={cn("size-1.5 rounded-full", DOT[row.status])} aria-hidden />{row.statusLabel}</span>
                  {row.original !== null && <span className="tabular-nums">AI 预估 <Score row={row} /></span>}
                  <span className="tabular-nums">{row.date}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Table className="hidden table-fixed sm:table">
          <TableHeader>
            <TableRow className="bg-sunk/60 hover:bg-sunk/60">
              <TableHead className="w-auto pl-5">题目</TableHead>
              <TableHead className="w-20">类型</TableHead>
              <TableHead className="w-32 lg:w-36">状态</TableHead>
              <TableHead className="w-28 text-right">AI 预估分</TableHead>
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
                <TableCell className="text-muted-foreground">{row.kind}</TableCell>
                <TableCell><span className="inline-flex items-center gap-2"><span className={cn("size-1.5 rounded-full", DOT[row.status])} aria-hidden />{row.statusLabel}</span></TableCell>
                <TableCell className="text-right text-sm font-medium tabular-nums">
                  {row.original === null ? <span className="text-muted-foreground">—</span> : <Score row={row} />}
                </TableCell>
                <TableCell className="meta hidden text-right md:table-cell">{row.date}</TableCell>
                <TableCell className="pr-5 text-right"><ArrowRight className="ml-auto size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </>)}
    </div>
  );
}

function Score({ row }: { row: EssayRow }) {
  if (row.original === null) return null;
  return row.revision === null ? <>{row.original.toFixed(1)}</> : <><span className="text-muted-foreground">{row.original.toFixed(1)} → </span><span className="text-foreground">{row.revision.toFixed(1)}</span></>;
}
