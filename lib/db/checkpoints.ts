import "server-only";
import { aliasVersion } from "../question-bank/aliases";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "./client";
import { checkpoints, completionEvents, questions, familiarity, users } from "./schema";
import { isExposureUnknown } from "./practice-facts";
import { createSession } from "../pipeline/initial";
import { saveNewPractice } from "./create-practice";
import { getSession } from "./queries/sessions";
import { getRequestReceipt, writeRequestReceipt, ReceiptConflict } from "./request-receipts";
import { SessionError } from "../pipeline/engine";
import { checkpointState } from "../rules/checkpoint";
import type { SessionState } from "../pipeline/types";
import { readFeatures } from "../config/features";
export function checkpointHistory(userId: string) { return getDb().select().from(checkpoints).where(eq(checkpoints.userId, userId)).all(); }
function eligible(userId: string, key: string) {
  const db = getDb();
  return !isExposureUnknown(db.$client, userId, key) && !db.select().from(familiarity).where(and(eq(familiarity.userId, userId), eq(familiarity.exposureKey, key))).get();
}
export function getCheckpointState(userId: string, now = new Date().toISOString()) {
  const db = getDb(), history = checkpointHistory(userId), profile = JSON.parse(db.select().from(users).where(eq(users.id,userId)).get()!.profileJson);
  const dates = history.filter(c => c.status === "eligible").map(c => c.completedAt!).sort();
  const deep = db.select().from(completionEvents).where(eq(completionEvents.userId,userId)).all().filter(e => e.activity === "deep" && e.completedAt).map(e => e.completedAt!).sort();
  const state = checkpointState({firstDeepCompletedAt: deep[0] ?? null, lastEligibleCompletedAt: dates.at(-1) ?? null, deferredUntil: profile.checkpointDeferredUntil,
    activeAttemptId: history.find(c => c.status === "in_progress")?.attemptId,
    candidates: db.select().from(questions).where(eq(questions.isCurrent,true)).all().map(q => ({id:q.id,pool:q.pool,bankOrder:q.bankOrder,eligible:eligible(userId,q.exposureKey),eligibleTypeCount:history.filter(c => c.status === "eligible" && c.questionType === q.questionType).length}))},now);
  const candidate = state.candidateQuestionId ? db.select().from(questions).where(and(eq(questions.id,state.candidateQuestionId),eq(questions.isCurrent,true))).get() : undefined;
  return {...state,candidateText:candidate?.text};
}
export function startCheckpoint(userId: string, input: {questionId: string; declaration: "no" | "yes" | "unsure"; idempotencyKey: string}, now = new Date().toISOString()) {
  if (!readFeatures().CHECKPOINTS_ENABLED) throw new SessionError("独立模考尚未开放。",403,"feature_disabled");
  const db = getDb(), sqlite = db.$client, hash = createHash("sha256").update(JSON.stringify([input.questionId,input.declaration])).digest("hex");
  // Return a rejection value from the transaction so external declarations survive it.
  const result = sqlite.transaction(() => {
    const receipt = getRequestReceipt(sqlite,userId,input.idempotencyKey);
    if (receipt) { if(receipt.action !== "checkpoint" || receipt.paramsHash !== hash) throw new ReceiptConflict(); const session = getSession(userId,receipt.resultRef!); if(!session) throw new SessionError("检查点已删除。",409,"practice_deleted"); return {session}; }
    const q = db.select().from(questions).where(and(eq(questions.id,input.questionId),eq(questions.isCurrent,true))).get();
    if(!q) throw new SessionError("题目不存在。",404);
    if(input.declaration !== "no") {
      db.insert(familiarity).values({userId,exposureKey:q.exposureKey,firstAttemptId:"external-declaration",externalPractice:input.declaration}).onConflictDoUpdate({target:[familiarity.userId,familiarity.exposureKey],set:{externalPractice:input.declaration}}).run();
      return {error:"你已报告练过或不确定，请换一道题。"};
    }
    if(!["available","deferred"].includes(getCheckpointState(userId,now).state) || !eligible(userId,q.exposureKey)) return {error:"现在还不能用这道题开始独立模考，请刷新后重试。"};
    const session = createSession({kind:"free",mode:"mock",prompt:q.text});
    session.question = {id:q.id,version:q.version,exposureKey:q.exposureKey,bankVersion:q.bankVersion,primaryTopic:q.primaryTopic as NonNullable<SessionState["question"]>["primaryTopic"],questionType:q.questionType as SessionState["prompt"]["questionType"],text:q.text};
    session.prompt = {id:q.id,text:q.text,questionType:session.question.questionType,topicTags:[q.primaryTopic]};
    session.checkpointId = crypto.randomUUID(); session.createdAt = session.updatedAt = session.savedAt = now;
    db.insert(checkpoints).values({id:session.checkpointId,userId,attemptId:session.id,exposureKey:q.exposureKey,questionId:q.id,questionType:q.questionType,startedAt:now,deadlineAt:new Date(Date.parse(now)+40*60000).toISOString(),status:"in_progress",declaration:input.declaration,startQualified:true,startEvidenceJson:JSON.stringify({questionVersion:q.version,bankVersion:q.bankVersion,aliasVersion,exposureKey:q.exposureKey,legacyExposure:"known",priorAppAttempt:false,externalPractice:input.declaration,qualifiedAt:now})}).run();
    saveNewPractice(userId,session);
    writeRequestReceipt(sqlite,{userId,idempotencyKey:input.idempotencyKey,action:"checkpoint",paramsHash:hash,attemptId:session.id,resultRef:session.id,createdAt:now});
    return {session};
  }).immediate();
  if("error" in result) throw new SessionError(result.error!,409,"checkpoint_ineligible");
  return result.session;
}
export function deferCheckpoint(userId: string, now = new Date().toISOString()) {
  const db=getDb(); return db.$client.transaction(() => {
    const row=db.select().from(users).where(eq(users.id,userId)).get()!;
    const until=new Date(Date.parse(now)+7*86400000).toISOString();
    db.update(users).set({profileJson:JSON.stringify({...JSON.parse(row.profileJson),checkpointDeferredUntil:until})}).where(eq(users.id,userId)).run();return until;
  }).immediate();
}
