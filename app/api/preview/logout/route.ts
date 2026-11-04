import { cookies } from "next/headers";
import { apiError, assertSameOrigin } from "@/lib/auth/http";
import { PREVIEW_COOKIE, previewCookieOptions } from "@/lib/preview/access";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    (await cookies()).set(PREVIEW_COOKIE, "", previewCookieOptions(0));
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
