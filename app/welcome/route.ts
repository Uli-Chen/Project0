import { landingPage, LANDING_HEADERS } from "@/lib/landing";

export const runtime = "nodejs";

/** The public marketing page. Logged-out visitors to / are sent here (see proxy.ts). */
export async function GET() {
  return new Response(await landingPage(), { headers: LANDING_HEADERS });
}
