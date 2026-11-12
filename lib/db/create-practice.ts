import "server-only";
import { publicUser, userById } from "./queries/users";
import { readFeatures } from "../config/features";
import { requirementSchema } from "../question-bank/types";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import { getDb } from "./client";
import { attemptMarkers, questions, topicCards, checkpoints } from "./schema";
import { getSession, saveSession } from "./queries/sessions";
import { recordAttempt } from "./practice-facts";
import { questionContext, resolveAttempt } from "./question-context";
import { getRequestReceipt, ReceiptConflict, writeRequestReceipt } from "./request-receipts";
import { createSession } from "../pipeline/initial";
import { SessionError } from "../pipeline/engine";
import type { questionCreateSessionSchema } from "../pipeline/schemas";
import type { SessionState } from "../pipeline/types";

export function saveNewPractice(userId: string, session: SessionState) {
  const sqlite = getDb().$client;
  sqlite.transaction(() => {
    const family = resolveAttempt(session, questionContext(sqlite)).exposureKey;
    if (family) {
      const active = getDb().select().from(checkpoints).where(and(eq(checkpoints.userId,userId),eq(checkpoints.exposureKey,family),eq(checkpoints.status,"in_progress"))).get();
      if(active && active.attemptId !== session.id) throw new SessionError("这道题正在进行独立模考，请先完成或关闭。",409,"checkpoint_family_busy");
    }
    if (readFeatures().TUTOR_V2_ENABLED && !getSession(userId, session.id)) {
      const owner = userById(userId);
      if (owner) session.nudgesEnabled = publicUser(owner).profile.nudgesDefault !== false;
    }
    saveSession(userId, session);
    recordAttempt(sqlite, userId, session, questionContext(sqlite));
  }).immediate();
}

/** Free practice (suggested, topic or pasted prompt) and plain mocks. With an intent key the creation
 * is recorded as a receipt in the same transaction, so a retry after a lost response returns the
 * essay that was already created instead of starting another one. */
export function createFreePractice(userId: string, input: Parameters<typeof createSession>[0], idempotencyKey: string | undefined, prepare: (session: SessionState) => void = () => {}) {
  const sqlite = getDb().$client;
  const paramsHash = createHash("sha256").update(JSON.stringify({ kind: input.kind, mode: input.mode, prompt: input.prompt ?? null })).digest("hex");
  return sqlite.transaction(() => {
    if (idempotencyKey) {
      const receipt = getRequestReceipt(sqlite, userId, idempotencyKey);
      if (receipt) {
        if (receipt.action !== "createFreePractice" || receipt.paramsHash !== paramsHash) throw new ReceiptConflict();
        const session = getSession(userId, receipt.resultRef);
        if (!session) throw new SessionError("这次练习已删除，请使用新请求键另开练习。", 409, "practice_deleted");
        return { session, status: 200 };
      }
    }
    const session = createSession(input);
    prepare(session);
    saveNewPractice(userId, session);
    if (idempotencyKey) writeRequestReceipt(sqlite, { userId, idempotencyKey, attemptId: session.id,
      action: "createFreePractice", paramsHash, resultRef: session.id, createdAt: session.createdAt });
    return { session, status: 201 };
  }).immediate();
}

export function createQuestionPractice(userId: string, input: z.infer<typeof questionCreateSessionSchema>) {
  const db = getDb(), sqlite = db.$client;
  const paramsHash = createHash("sha256").update(JSON.stringify({ questionId: input.questionId,
    activity: input.activity, mode: input.mode, rewriteOfDeepId: input.rewriteOfDeepId ?? null })).digest("hex");
  return sqlite.transaction(() => {
    if (input.activity === "quick" && !readFeatures().QUICK_ENABLED) throw new SessionError("速刷功能尚未开放。", 403, "feature_disabled");
    if (input.mode === "mock") throw new SessionError("按题目模考需从独立模考入口开始。", 409, "mock_requires_checkpoint");
    const receipt = getRequestReceipt(sqlite, userId, input.idempotencyKey);
    if (receipt) {
      if (receipt.action !== "createQuestionPractice" || receipt.paramsHash !== paramsHash) throw new ReceiptConflict();
      const session = getSession(userId, receipt.resultRef!);
      // Never recreate deleted content when a lost creation response is retried.
      if (!session) throw new SessionError("这次练习已删除，请使用新请求键另开练习。", 409, "practice_deleted");
      return { session, status: 200 };
    }
    const row = db.select().from(questions).where(and(eq(questions.id, input.questionId), eq(questions.isCurrent, true))).get();
    if (!row) throw new SessionError("题目不存在或不是当前版本。", 404);
    const context = questionContext(sqlite);
    if (input.rewriteOfDeepId) {
      const source = getSession(userId, input.rewriteOfDeepId);
      const marker = db.select().from(attemptMarkers).where(and(eq(attemptMarkers.userId, userId), eq(attemptMarkers.attemptId, input.rewriteOfDeepId))).get();
      if (!source && !marker) throw new SessionError("来源练习不存在。", 404);
      const activity = source?.activity ?? marker!.activity;
      const family = source ? resolveAttempt(source, context).exposureKey : marker!.exposureKey;
      if (activity !== "deep" || family !== row.exposureKey) throw new SessionError("只能关联同一题目家族的精练。", 409, "invalid_rewrite");
    }
    const session = createSession({ kind: "free", mode: "practice", prompt: row.text });
    session.question = { id: row.id, version: row.version, exposureKey: row.exposureKey, bankVersion: row.bankVersion,
      primaryTopic: row.primaryTopic as NonNullable<SessionState["question"]>["primaryTopic"],
      questionType: row.questionType as SessionState["prompt"]["questionType"], text: row.text };
    session.prompt = { id: session.question.id, text: session.question.text,
      questionType: session.question.questionType, topicTags: [session.question.primaryTopic] };
    session.rewriteOfDeepId = input.rewriteOfDeepId ?? null;
    session.lastStudentActionAt = session.createdAt;
    if (input.activity === "quick") { session.activity = "quick"; session.stage = "quick"; session.messages = []; }
    saveNewPractice(userId, session);
    if (input.activity === "quick") db.insert(topicCards).values({ id: crypto.randomUUID(), userId, attemptId: session.id,
      questionId: row.id, questionVersion: row.version, contentVersion: 0,
      contentJson: JSON.stringify({ layout: requirementSchema.parse(JSON.parse(row.requirementsJson)).layout, parts: [] }),
      state: "draft", createdAt: session.createdAt, updatedAt: session.createdAt }).run();
    writeRequestReceipt(sqlite, { userId, idempotencyKey: input.idempotencyKey, attemptId: session.id,
      action: "createQuestionPractice", paramsHash, resultRef: session.id, createdAt: session.createdAt });
    return { session, status: 201 };
  }).immediate();
}
