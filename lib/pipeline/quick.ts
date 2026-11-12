import "server-only";
import { quickDetails } from "./quick-model";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { defaultContinuations, completionEvents, topicCards, writingSessions } from "../db/schema";
import { getSession } from "../db/queries/sessions";
import { cardRequirements, getCard, type TopicCard } from "../db/queries/cards";
import { saveNewPractice } from "../db/create-practice";
import { getRequestReceipt, ReceiptConflict, writeRequestReceipt } from "../db/request-receipts";
import { cardSlots } from "../quick/layouts";
import { outlineFromCard, outlineHasContent } from "../quick/outline-seed";
import { cardPrewriteOpening } from "../learning/prewrite-guidance";
import { partTextSchema, quickActionSchema, type Part, type QuickAction } from "../quick/schemas";
import { assertQuickSession } from "./http";
import { createSession } from "./initial";
import { SessionError } from "./engine";
import type { SessionState } from "./types";

function response(userId: string, session: SessionState, card: TopicCard, deepSession?: SessionState) {
  return { defaultDeepId: getDb().select().from(defaultContinuations).where(and(eq(defaultContinuations.userId, card.userId), eq(defaultContinuations.quickAttemptId, session.id))).get()?.deepAttemptId ?? null, session, card, requirements: cardRequirements(card), ...quickDetails(userId, session.id), ...(deepSession ? { deepSession } : {}) };
}
export function readQuick(userId: string, id: string) {
  return getDb().$client.transaction(() => {
    const session = getSession(userId, id); assertQuickSession(session);
    const card = getCard(userId, id);
    if (!card) throw new SessionError("卡片不存在。", 404);
    return response(userId, session, card);
  })();
}
function existingChild(userId: string, id: string) {
  const child = getSession(userId, id);
  const completed = getDb().select().from(completionEvents).where(and(eq(completionEvents.userId, userId), eq(completionEvents.attemptId, id))).get();
  if (!child || (child.lifecycle === "closed" && !completed)) throw new SessionError("原来的作文已删除或放弃，请明确选择另开一次练习。", 409, "default_child_gone");
  return child;
}
function splitsSurrogate(text: string, at: number) {
  return at > 0 && at < text.length && /[\uD800-\uDBFF]/.test(text[at - 1]) && /[\uDC00-\uDFFF]/.test(text[at]);
}

/** All reads, receipts, card edits and child allocation share this IMMEDIATE transaction.
 * Never persist this response again at the HTTP boundary, and never upsert the source. */
export function commitQuickMutation(userId: string, id: string, action: QuickAction, now = new Date().toISOString()) {
  const input = quickActionSchema.parse(action);
  const { requestId, idempotencyKey, ...params } = input;
  const keys = [...new Set([idempotencyKey, requestId].filter((key): key is string => !!key))];
  const paramsHash = createHash("sha256").update(JSON.stringify(params)).digest("hex");
  const db = getDb(), sqlite = db.$client;
  return sqlite.transaction(() => {
    const session = getSession(userId, id); assertQuickSession(session);
    let card = getCard(userId, id);
    if (!card) throw new SessionError("卡片不存在。", 404);
    const receipts = keys.map(key => getRequestReceipt(sqlite, userId, key)).filter(r => r !== null);
    for (const receipt of receipts) {
      if (receipt.attemptId !== id || receipt.action !== input.action || receipt.paramsHash !== paramsHash) throw new ReceiptConflict();
    }
    const recordRequests = (resultRef: string) => {
      const previous = session.completedRequests ?? [];
      const missing = keys.filter(key => !previous.includes(key));
      if (missing.length) {
        session.completedRequests = [...previous, ...missing].slice(-50);
        db.update(writingSessions).set({ stateJson: JSON.stringify(session) })
          .where(and(eq(writingSessions.userId, userId), eq(writingSessions.id, id))).run();
      }
      for (const key of keys) writeRequestReceipt(sqlite, { userId, idempotencyKey: key, attemptId: id, action: input.action, paramsHash,
        resultRef, createdAt: now });
    };
    if (receipts.length) {
      const ref = receipts[0].resultRef;
      if (receipts.some(r => r.resultRef !== ref)) throw new ReceiptConflict();
      const child = input.action === "continueDeep" ? existingChild(userId, ref) : undefined;
      recordRequests(ref);
      return response(userId, session, card, child);
    }
    if (session.lifecycle === "closed" && input.action !== "continueDeep") throw new SessionError("练习已关闭，请先恢复。", 409, "lifecycle_conflict");
    let changed = false, deepSession: SessionState | undefined;
    const followups = session.messages.filter(m => m.role === "coach" && m.stage === "quick" && m.action === "quickFollowup");
    if (followups.length > 2) throw new SessionError("追问记录不符合当前版本。", 409, "unsupported_session");
    const afterFollowUp = followups.length as 0 | 1 | 2;
    if (input.action === "cardSave" || input.action === "cardExcerpt") {
      if (input.cardVersion !== card.contentVersion) throw new SessionError("卡片已在别处修改，请刷新后重试。", 409, "card_conflict");
      const slots = cardSlots(cardRequirements(card)), allowed = new Set(slots.map(s => s.key));
      const parts = new Map(card.content.parts.map(p => [p.key, p]));
      const update = (key: string, text: string, provenance: Part["provenance"]) => {
        if (!allowed.has(key)) throw new SessionError("该槽位不属于本题。", 400, "invalid_slot");
        if ((parts.get(key)?.text ?? "") === text) return;
        changed = true;
        if (text) parts.set(key, { key, text, provenance, afterFollowUp });
        else parts.delete(key);
      };
      if (input.action === "cardSave") {
        for (const part of input.parts) update(part.key, part.text, { kind: "direct", userId, editId: crypto.randomUUID(), editedAt: now, contentVersion: card.contentVersion + 1 });
      } else {
        const message = session.messages.find(m => m.id === input.messageId);
        if (!message || message.role !== "user" || message.userId !== userId) throw new SessionError("只能摘取你在本次练习中发送的原话。", 400, "invalid_excerpt");
        if (input.end <= input.start || input.end > message.content.length || splitsSurrogate(message.content, input.start) || splitsSurrogate(message.content, input.end)) throw new SessionError("摘取位置无效。", 400, "invalid_excerpt");
        const text = partTextSchema.parse(message.content.slice(input.start, input.end));
        update(input.key, text, { kind: "excerpt", userId, messageId: message.id, start: input.start, end: input.end });
      }
      if (changed) {
        const content = { ...card.content, parts: slots.flatMap(s => parts.has(s.key) ? [parts.get(s.key)!] : []) };
        db.update(topicCards).set({ contentJson: JSON.stringify(content), contentVersion: card.contentVersion + 1,
          state: card.state === "passed" ? "unchecked" : card.state, updatedAt: now })
          .where(and(eq(topicCards.userId, userId), eq(topicCards.id, card.id))).run();
        card = getCard(userId, id)!;
      }
    } else if (input.action === "quickAnswer") {
      const pending = followups.at(-1);
      if (!pending || session.messages.some(m => m.role === "user" && m.replyToMessageId === pending.id)) throw new SessionError("当前没有待回答的教练追问。", 409, "no_pending_followup");
      session.messages.push({ id: crypto.randomUUID(), userId, role: "user", stage: "quick", action: "quickAnswer",
        content: input.text, afterFollowUp, replyToMessageId: pending.id });
      changed = true;
    } else {
      const mapping = input.explicitNew ? undefined : db.select().from(defaultContinuations).where(and(eq(defaultContinuations.userId, userId), eq(defaultContinuations.quickAttemptId, id))).get();
      if (mapping) deepSession = existingChild(userId, mapping.deepAttemptId);
      else {
        deepSession = createSession({ kind: "free", mode: "practice", prompt: session.prompt.text });
        deepSession.question = structuredClone(session.question); deepSession.prompt = structuredClone(session.prompt);
        deepSession.continuedFromQuickId = id;
        deepSession.cardSnapshot = { cardId: card.id, contentVersion: card.contentVersion, content: structuredClone(card.content),
          state: card.state, lastCheckedVersion: card.lastCheckedVersion, snapshotAt: now };
        // The card is the student's own prewriting: start the outline from it instead of asking again.
        const seeded = outlineFromCard(cardRequirements(card), card.content);
        if (outlineHasContent(seeded)) {
          deepSession.outline = seeded;
          const opening = deepSession.messages.find(m => m.role === "coach" && m.action === "opening");
          if (opening) opening.content = cardPrewriteOpening;
        }
        deepSession.createdAt = deepSession.updatedAt = deepSession.savedAt = deepSession.lastStudentActionAt = now;
        saveNewPractice(userId, deepSession);
        if (!input.explicitNew) db.insert(defaultContinuations).values({ userId, quickAttemptId: id, deepAttemptId: deepSession.id, createdAt: now }).run();
        changed = true;
      }
    }
    if (changed) {
      session.version++; session.updatedAt = session.savedAt = session.lastStudentActionAt = now;
      session.schemaVersion = Math.max(2, session.schemaVersion);
    }
    if (changed) db.update(writingSessions).set({ stateJson: JSON.stringify(session), updatedAt: session.updatedAt })
      .where(and(eq(writingSessions.userId, userId), eq(writingSessions.id, id))).run();
    recordRequests(deepSession?.id ?? id);
    return response(userId, session, card, deepSession);
  }).immediate();
}
