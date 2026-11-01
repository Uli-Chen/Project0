import { requireApiUser } from '@/lib/auth/server';
import { readFeatures } from '@/lib/config/features';
import { getTopicData } from '@/lib/db/queries/topics';
import { sessionApiError } from '@/lib/pipeline/http';
export const runtime='nodejs';
export async function GET(){try{const user=await requireApiUser();if(!readFeatures().QUESTION_BANK_ENABLED)return Response.json({error:'题库功能尚未开放'},{status:403});const data=getTopicData(user.id);return Response.json({topics:data.topics,counts:data.counts},{headers:{'Cache-Control':'no-store'}});}catch(e){return sessionApiError(e);}}
