import { cookies } from "next/headers";
import { z } from "zod";
import { apiError, assertSameOrigin, AuthError, readJson } from "@/lib/auth/http";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "@/lib/auth/password";
import { clearAuthLimit, limitAuth } from "@/lib/auth/rate-limit";
import { clientAddress, createPreviewToken, PREVIEW_COOKIE, previewCookieOptions, readPreviewConfig } from "@/lib/preview/access";

const schema = z.object({ password: z.string().min(1, "Enter the password.").max(200, "Incorrect password.") });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { password } = schema.parse(await readJson(request, 2048));
    const key = `preview:${clientAddress(request)}`;
    limitAuth(key, 8);
    limitAuth("preview:global", 60, 60 * 60_000);
    const config = readPreviewConfig();
    // Run the KDF even when access is not configured, so timing reveals nothing.
    const valid = await verifyPassword(password, config?.hash ?? DUMMY_PASSWORD_HASH);
    if (!config || !valid) throw new AuthError("Incorrect password.", 401);
    clearAuthLimit(key);
    (await cookies()).set(PREVIEW_COOKIE, createPreviewToken(config), previewCookieOptions());
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
