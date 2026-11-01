import { requireApiUser } from "@/lib/auth/server";
import { assertSameOrigin, readJson } from "@/lib/auth/http";
import { sessionApiError } from "@/lib/pipeline/http";
import { startCheckpoint } from "@/lib/db/checkpoints";
import { readFeatures } from "@/lib/config/features";
import { SessionError } from "@/lib/pipeline/engine";
import { z } from "zod";
export const runtime = "nodejs";
export async function POST(request: Request) {
 try { assertSameOrigin(request); const user=await requireApiUser();
 if(!readFeatures().CHECKPOINTS_ENABLED) throw new SessionError("检查点尚未开放。",403,"feature_disabled");
 const input=z.object({questionId:z.string().min(1),declaration:z.enum(["no","yes","unsure"]),idempotencyKey:z.string().min(1).max(200)}).strict().parse(await readJson(request));
 return Response.json({session:startCheckpoint(user.id,input)});
 }catch(error){return sessionApiError(error);}
}
