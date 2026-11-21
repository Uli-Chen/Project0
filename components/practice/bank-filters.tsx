"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Search, X } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type FilterOption = { label: string; href: string; active: boolean };
export type FilterGroup = { label: string; options: FilterOption[] };

/** Search the question text; the words live in the URL beside the filters, so a search can be shared or reloaded. */
export function BankSearch({ value }: { value: string }) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const [text, setText] = useState(value);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const go = (next: string) => {
    const query = new URLSearchParams(params.toString());
    query.delete("page");
    if (next.trim()) query.set("q", next.trim()); else query.delete("q");
    router.replace(query.size ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const change = (next: string) => {
    setText(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => go(next), 250);
  };
  return (
    <form role="search" className="relative mb-3 w-full max-w-sm" onSubmit={(event) => { event.preventDefault(); window.clearTimeout(timer.current); go(text); }}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
      <input type="search" value={text} onChange={(event) => change(event.target.value)} maxLength={80} placeholder="搜索题目里的词，例如 technology" aria-label="搜索题目"
        className="h-9 w-full rounded-full border border-input bg-sheet pr-9 pl-9 text-[14px] transition-[border-color,box-shadow] duration-(--dur-standard) ease-(--ease-soft) outline-none placeholder:text-faint hover:not-focus-visible:border-foreground/25 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden" />
      {text && <button type="button" aria-label="清除搜索" onClick={() => change("")} className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors duration-(--dur-fast) hover:bg-sunk hover:text-foreground"><X className="size-3.5" /></button>}
    </form>
  );
}

/** The first group is always shown; the rest fold away, and the fold names what they are set to. */
export function BankFilters({ groups }: { groups: FilterGroup[] }) {
  const [open, setOpen] = useState(false);
  const [first, ...rest] = groups;
  const summary = rest.map((group) => group.options.find((option) => option.active)?.label).filter((label) => label && label !== "全部").join("、");
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col">
      <Group group={first} />
      <CollapsibleContent>
        <div className="flex flex-col gap-2 pt-2">
          {rest.map((group) => <Group key={group.label} group={group} />)}
        </div>
      </CollapsibleContent>
      <CollapsibleTrigger className="mt-2 -ml-3 inline-flex h-8 w-fit items-center gap-1.5 rounded-full px-3 text-[14px] text-muted-foreground transition-colors duration-(--dur-fast) hover:bg-sunk hover:text-foreground">
        {open ? "收起" : <>更多筛选{summary && <span className="text-foreground">{summary}</span>}</>}
        <ChevronDown className={cn("size-4 transition-transform duration-(--dur-layout) ease-(--ease-soft)", open && "rotate-180")} aria-hidden />
      </CollapsibleTrigger>
    </Collapsible>
  );
}

function Group({ group }: { group: FilterGroup }) {
  return (
    <div role="group" aria-label={group.label} className="flex flex-wrap items-center gap-1">
      <span className="mr-2 w-8 text-[14px] text-faint">{group.label}</span>
      {group.options.map((option) => (
        <Link key={option.href} href={option.href} scroll={false} aria-current={option.active ? "true" : undefined} className="chip">{option.label}</Link>
      ))}
    </div>
  );
}
