import "server-only";
import { aliasVersion } from "../question-bank/aliases";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "./client";
import { checkpoints, completionEvents, questions, familiarity, users } from "./schema";
import { isExposureUnknown } from "./practice-facts";
import { createSession } from "../pipeline/initial";
import { saveNewPractice } from "./create-practice";
import { deleteSession, getSession } from "./queries/sessions";
import { getRequestReceipt, writeRequestReceipt, ReceiptConflict } from "./request-receipts";
import { SessionError } from "../pipeline/engine";
import { checkpointState, MOCK_DURATION_SECONDS } from "../rules/checkpoint";
import type { SessionState } from "../pipeline/types";
import { readFeatures } from "../config/features";
export function checkpointHistory(userId: string) { return getDb().select().from(checkpoints).where(eq(checkpoints.userId, userId)).all(); }
export function sessionCheckpoint(userId: string, attemptId: string) {
  return getDb().select().from(checkpoints).where(and(eq(checkpoints.userId, userId), eq(checkpoints.attemptId, attemptId))).get();
}
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
    db.insert(checkpoints).values({id:session.checkpointId,userId,attemptId:session.id,exposureKey:q.exposureKey,questionId:q.id,questionType:q.questionType,startedAt:now,deadlineAt:new Date(Date.parse(now)+MOCK_DURATION_SECONDS*1000).toISOString(),status:"in_progress",declaration:input.declaration,startQualified:true,startEvidenceJson:JSON.stringify({questionVersion:q.version,bankVersion:q.bankVersion,aliasVersion,exposureKey:q.exposureKey,legacyExposure:"known",priorAppAttempt:false,externalPractice:input.declaration,qualifiedAt:now})}).run();
    saveNewPractice(userId,session);
    writeRequestReceipt(sqlite,{userId,idempotencyKey:input.idempotencyKey,action:"checkpoint",paramsHash:hash,attemptId:session.id,resultRef:session.id,createdAt:now});
    return {session};
  }).immediate();
  if("error" in result) throw new SessionError(result.error!,409,"checkpoint_ineligible");
  return result.session;
}
/** How long after starting a mock the learner may still say they have practised the question and swap it. */
export const SWAP_WINDOW_MS = 5 * 60_000;

/** "这道题我练过，换一道": records the question as practised elsewhere, removes the untouched attempt and
 * starts a fresh 40 minutes on the next candidate. Only before anything is written and within the first
 * five minutes, so a mock that has begun is never thrown away. A retry returns the session it started. */
export function swapCheckpoint(userId: string, attemptId: string, idempotencyKey: string, now = new Date().toISOString()) {
  if (!readFeatures().CHECKPOINTS_ENABLED) throw new SessionError("独立模考尚未开放。",403,"feature_disabled");
  const db = getDb(), sqlite = db.$client, startKey = `${idempotencyKey}:start`;
  const replay = (key: string, action: string) => {
    const receipt = getRequestReceipt(sqlite,userId,key);
    if (!receipt) return null;
    if (receipt.action !== action || (action === "checkpoint_swap" && receipt.paramsHash !== attemptId)) throw new ReceiptConflict();
    const session = getSession(userId,receipt.resultRef!);
    if (!session) throw new SessionError("换的那次模考已删除。",409,"practice_deleted");
    return session;
  };
  const result = sqlite.transaction(() => {
    const done = replay(idempotencyKey, "checkpoint_swap") ?? replay(startKey, "checkpoint");
    if (done) return done;
    const row = db.select().from(checkpoints).where(and(eq(checkpoints.userId,userId),eq(checkpoints.attemptId,attemptId),eq(checkpoints.status,"in_progress"))).get();
    if (!row) throw new SessionError("这次模考已经结束，不能换题。",409,"checkpoint_closed");
    const session = getSession(userId,attemptId);
    if (!session) throw new SessionError("模考不存在。",404);
    if (session.drafts.original.trim() || session.originalSubmittedAt) throw new SessionError("你已经开始写了，不能再换题。",409,"checkpoint_started");
    if (Date.parse(now) - Date.parse(row.startedAt) > SWAP_WINDOW_MS) throw new SessionError("开考已超过 5 分钟，不能再换题。",409,"checkpoint_started");
    db.insert(familiarity).values({userId,exposureKey:row.exposureKey,firstAttemptId:"external-declaration",externalPractice:"yes"}).onConflictDoUpdate({target:[familiarity.userId,familiarity.exposureKey],set:{externalPractice:"yes"}}).run();
    // Keep the declared exposure and abandon the untouched attempt even if the bank has no replacement.
    deleteSession(userId, attemptId);
    const candidate = getCheckpointState(userId, now).candidateQuestionId;
    if (!candidate) return null;
    const next = startCheckpoint(userId, { questionId: candidate, declaration: "no", idempotencyKey: startKey }, now);
    writeRequestReceipt(sqlite, { userId, idempotencyKey, action: "checkpoint_swap", paramsHash: attemptId, attemptId: next.id, resultRef: next.id, createdAt: now });
    return next;
  }).immediate();
  if (!result) throw new SessionError("暂时没有你没练过的题，可以回到模考页改做普通模考。", 409, "checkpoint_unavailable");
  return result;
}

export function deferCheckpoint(userId: string, now = new Date().toISOString()) {
  const db=getDb(); return db.$client.transaction(() => {
    const row=db.select().from(users).where(eq(users.id,userId)).get()!;
    const until=new Date(Date.parse(now)+7*86400000).toISOString();
    db.update(users).set({profileJson:JSON.stringify({...JSON.parse(row.profileJson),checkpointDeferredUntil:until})}).where(eq(users.id,userId)).run();return until;
  }).immediate();
}
