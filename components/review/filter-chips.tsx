import Link from "next/link";

/** One labelled row of filter chips; each chip is a link, so the filter lives in the URL. */
export function FilterChips({ label, options, active, href }: { label: string; options: [string | null, string][]; active: string | null; href: (value: string | null) => string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1">
      <span className="mr-2 w-8 text-[14px] text-faint">{label}</span>
      {options.map(([value, name]) => (
        <Link key={name} href={href(value)} scroll={false} aria-current={active === value ? "true" : undefined} className="chip">{name}</Link>
      ))}
    </div>
  );
}
