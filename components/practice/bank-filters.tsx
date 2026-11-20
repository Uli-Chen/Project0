"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilterOption = { label: string; href: string; active: boolean };
export type FilterGroup = { label: string; options: FilterOption[] };

/** The first group is always shown; the rest fold away, and the fold names what they are set to. */
export function BankFilters({ groups }: { groups: FilterGroup[] }) {
  const [open, setOpen] = useState(false);
  const [first, ...rest] = groups;
  const summary = rest.map((group) => group.options.find((option) => option.active)?.label).filter((label) => label && label !== "全部").join(" · ");
  return (
    <div className="flex flex-col gap-3">
      <Group group={first} />
      {open && rest.map((group) => <Group key={group.label} group={group} />)}
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="-ml-3 inline-flex h-8 w-fit items-center gap-1.5 rounded-full px-3 text-[14px] text-muted-foreground transition-colors hover:bg-sunk hover:text-foreground">
        {open ? "收起" : <>更多筛选{summary && <span className="text-foreground">{summary}</span>}</>}
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
    </div>
  );
}

function Group({ group }: { group: FilterGroup }) {
  return (
    <div role="group" aria-label={group.label} className="flex flex-wrap items-center gap-1">
      <span className="mr-3 w-8 text-[14px] text-muted-foreground">{group.label}</span>
      {group.options.map((option) => (
        <Link key={option.href} href={option.href} scroll={false} aria-current={option.active ? "true" : undefined} className={cn("rounded-full px-3 py-1 text-[14px] transition-colors", option.active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-sunk hover:text-foreground")}>{option.label}</Link>
      ))}
    </div>
  );
}
