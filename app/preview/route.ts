import { readFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { hasPreviewAccess, PREVIEW_COOKIE } from "@/lib/preview/access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The page lives outside public/, so it is only ever sent by this handler.
const PAGE = path.join(process.cwd(), "docs", "designs", "mockups", "landing-v4.html");
let cached: Promise<string> | null = null;

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
};

export async function GET() {
  if (!hasPreviewAccess((await cookies()).get(PREVIEW_COOKIE)?.value)) {
    return new Response(null, { status: 303, headers: { ...PRIVATE_HEADERS, Location: "/" } });
  }
  cached ??= readFile(PAGE, "utf8").catch(error => { cached = null; throw error; });
  return new Response(await cached, {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      // Everything the page needs is inline; nothing may load from or post to elsewhere.
      "Content-Security-Policy": "default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}
