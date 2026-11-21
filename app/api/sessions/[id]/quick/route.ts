import { requireApiUser } from "@/lib/auth/server";
import { sessionApiError } from "@/lib/pipeline/http";
import { readQuick } from "@/lib/pipeline/quick";
import { quickSessionDetail } from "@/lib/pipeline/session-detail";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(), { id } = await params;
    return Response.json(quickSessionDetail(readQuick(user.id, id)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return sessionApiError(error); }
}
