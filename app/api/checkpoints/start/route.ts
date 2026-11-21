import { requireApiUser } from "@/lib/auth/server";
import { assertSameOrigin, readJson } from "@/lib/auth/http";
import { sessionApiError } from "@/lib/pipeline/http";
import { getCheckpointState, startCheckpoint } from "@/lib/db/checkpoints";
import { readFeatures } from "@/lib/config/features";
import { SessionError } from "@/lib/pipeline/engine";
import { z } from "zod";
import { sessionDetail } from "@/lib/pipeline/session-detail";
export const runtime = "nodejs";
export async function POST(request: Request) {
 try { assertSameOrigin(request); const user=await requireApiUser();
 if(!readFeatures().CHECKPOINTS_ENABLED) throw new SessionError("独立模考尚未开放。",403,"feature_disabled");
 // One click starts a mock: without a question the server takes the next candidate, and the learner
 // can still say on the exam page that they have practised it.
 const input=z.object({questionId:z.string().min(1).optional(),declaration:z.enum(["no","yes","unsure"]).default("no"),idempotencyKey:z.string().min(1).max(200)}).strict().parse(await readJson(request));
 const questionId=input.questionId ?? getCheckpointState(user.id).candidateQuestionId;
 if(!questionId) throw new SessionError("暂时没有你没练过的题，可以改做普通模考。",409,"checkpoint_unavailable");
 return Response.json({session:sessionDetail(startCheckpoint(user.id,{...input,questionId}))});
 }catch(error){return sessionApiError(error);}
}
