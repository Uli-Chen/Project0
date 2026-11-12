import { requireApiUser } from "@/lib/auth/server";
import { assertSameOrigin, readJson } from "@/lib/auth/http";
import { sessionApiError } from "@/lib/pipeline/http";
import { deferCheckpoint } from "@/lib/db/checkpoints";
import { readFeatures } from "@/lib/config/features";
import { SessionError } from "@/lib/pipeline/engine";
import { z } from "zod";
export const runtime = "nodejs";
export async function POST(request: Request) {
 try { assertSameOrigin(request); const user=await requireApiUser();
 if(!readFeatures().CHECKPOINTS_ENABLED) throw new SessionError("独立模考尚未开放。",403,"feature_disabled");
 z.object({}).strict().parse(await readJson(request)); return Response.json({deferredUntil:deferCheckpoint(user.id)});
 }catch(error){return sessionApiError(error);}
}
