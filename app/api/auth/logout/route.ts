import { apiError, assertSameOrigin } from "@/lib/auth/http";
import { clearAuthSession } from "@/lib/auth/server";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await clearAuthSession();
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
