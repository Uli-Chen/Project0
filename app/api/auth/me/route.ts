import { apiError } from "@/lib/auth/http";
import { requireApiUser } from "@/lib/auth/server";

export async function GET() {
  try {
    return Response.json({ user: await requireApiUser() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
