import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

// The marketing page is a single self-contained HTML file kept outside public/ and sent by a route
// handler. Its sign-in and join buttons are placeholders in the file; they are pointed at the app here.
const PAGE = path.join(process.cwd(), "docs", "designs", "mockups", "landing-v4.html");
let cached: Promise<string> | null = null;

export function landingPage() {
  cached ??= readFile(PAGE, "utf8").then((html) => html
    .replaceAll('href="#" data-t="nav.login"', 'href="/login" data-t="nav.login"')
    // Registration is closed during the beta; /register explains that and links to sign-in.
    .replaceAll('href="#" data-t="cta.join"', 'href="/register" data-t="cta.join"')
    .replaceAll('href="#" data-t="ft.privacy"', 'href="/privacy" data-t="ft.privacy"'))
    .catch((error) => { cached = null; throw error; });
  return cached;
}

export const LANDING_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "public, max-age=0, must-revalidate",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Everything the page needs is inline; nothing may load from or post to elsewhere.
  "Content-Security-Policy": "default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};
