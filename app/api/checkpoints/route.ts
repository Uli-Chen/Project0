import { requireApiUser } from "@/lib/auth/server";
import { sessionApiError } from "@/lib/pipeline/http";
import { getCheckpointState, checkpointHistory } from "@/lib/db/checkpoints";
import { readFeatures } from "@/lib/config/features";
export async function GET() { try {const user=await requireApiUser(); return Response.json({enabled:readFeatures().CHECKPOINTS_ENABLED,...getCheckpointState(user.id),history:checkpointHistory(user.id),serverNow:new Date().toISOString()});} catch(error){return sessionApiError(error);} }
