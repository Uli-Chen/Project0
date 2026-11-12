import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { defaultContinuations, quickOperations, quickPackages, quickOperationInputs, quickCheckResults, topicCards, completionEvents, writingSessions } from "../db/schema";
import { getCard, cardRequirements } from "../db/queries/cards";
import { getSession } from "../db/queries/sessions";
import { getRequestReceipt, writeRequestReceipt, ReceiptConflict } from "../db/request-receipts";
import { quickModelActionSchema, type QuickModelAction } from "../quick/schemas";
import { quickRequirements, validQuickNote, validQuickQuestion } from "../rules/quick";
import { cardSlots } from "../quick/layouts";
import { occupiedBudget, type CallAccounting } from "../rules/llm-budget";
import { quickBudget, callConfigVersion } from "../llm/budget";
import { reserveCall, type Reservation } from "../llm/calls";
import { generateJson, buildMessages, estimateInputTokens } from "../llm/client";
import { getLlmConfig } from "../llm/config";
import { prompt } from "../llm/prompts";
import { assertQuickSession } from "./http";
import { SessionError } from "./engine";
import type { SessionState } from "./types";
/** Deterministic note for a requirement with blank fields: name the fields, cost no model call. */
function emptyNote(labels: string[]) { return labels.length ? `还没填：${labels.join("、")}。` : "请补充本项回答和理由。"; }
const followSchema = z.object({ question: z.string().min(1).max(80), targetKey: z.string().nullable() }).strict();
const checkSchema = z.object({ results: z.array(z.object({ id: z.string(), status: z.enum(["met", "gap"]), note: z.string().max(60).nullable() }).strict()) }).strict();
type Result = z.infer<typeof checkSchema>["results"][number];
type Operation = typeof quickOperations.$inferSelect;
/** variant "ask": the student spoke first (quickFollowup with text). Older frozen rows have no variant and keep the original prompt. */
type Frozen = { kind: "followup" | "check"; variant?: "ask"; context: { task: string; requirements: ReturnType<typeof quickRequirements>; parts: { key: string; text: string }[]; messages?: { role: string; content: string }[]; coachingFocus?: "explain_reason" | "develop" }; empty: Result[]; configVersion: string };
const instruction = {
  followup: prompt("quick/followup"),
  ask: prompt("quick/followup-ask"),
  check: prompt("quick/check")
};
/** Retries read the frozen input, so they keep the prompt the operation started with. */
function instructionFor(op: Operation, frozen: Frozen) { return frozen.variant === "ask" ? instruction.ask : instruction[op.kind]; }
function scope(userId: string, id: string) { return and(eq(quickOperations.userId, userId), eq(quickOperations.attemptId, id)); }
function pack(userId: string, id: string) { return getDb().select().from(quickPackages).where(and(eq(quickPackages.userId, userId), eq(quickPackages.attemptId, id))).all().filter(p => !p.closedAt).at(-1); }
function usage(p: typeof quickPackages.$inferSelect) { return JSON.parse(p.usedJson) as { followups: number; checks: number; retries: number }; }
export function quickDetails(userId: string, id: string, now = new Date().toISOString()) {
  const db = getDb(), p = pack(userId, id), u = p ? usage(p) : { followups: 0, checks: 0, retries: 0 }, limits = p?.kind === "supplemental" ? quickBudget.supplemental : quickBudget.initial;
  const rows = db.$client.prepare("SELECT * FROM llm_calls WHERE user_id=? AND package_id IS NOT NULL AND started_at>?").all(userId, new Date(Date.parse(now) - quickBudget.user.windowMs).toISOString()) as CallAccounting[];
  const used = occupiedBudget(rows);
  return { operations: db.select().from(quickOperations).where(scope(userId, id)).all(), checkResults: db.select().from(quickCheckResults).where(and(eq(quickCheckResults.userId, userId), eq(quickCheckResults.attemptId, id))).all().map(r => ({ ...r, results: JSON.parse(r.resultsJson) as Result[] })), budget: { packageId: p?.id ?? null, kind: p?.kind ?? "initial", remaining: { followups: limits.followups - u.followups, checks: limits.checks - u.checks, retries: limits.retries - u.retries }, nextSupplementalAt: p ? new Date(Date.parse(p.grantedAt) + quickBudget.supplemental.cooldownMs).toISOString() : null, userRemaining: { calls: Math.max(0, quickBudget.user.limits.calls - used.calls), inputTokens: Math.max(0, quickBudget.user.limits.inputTokens - used.inputTokens), outputTokens: Math.max(0, quickBudget.user.limits.outputTokens - used.outputTokens), waitMs: Math.max(0, quickBudget.user.limits.waitMs - used.waitMs) } } };
}
function response(userId: string, id: string) { const session = getSession(userId, id); assertQuickSession(session); return { defaultDeepId: getDb().select().from(defaultContinuations).where(and(eq(defaultContinuations.userId, userId), eq(defaultContinuations.quickAttemptId, id))).get()?.deepAttemptId ?? null, session, card: getCard(userId, id)!, requirements: cardRequirements(getCard(userId, id)!), ...quickDetails(userId, id) }; }
function persist(userId: string, s: SessionState, now: string) { s.version++; s.updatedAt = s.savedAt = now; getDb().update(writingSessions).set({ stateJson: JSON.stringify(s), updatedAt: now }).where(and(eq(writingSessions.userId, userId), eq(writingSessions.id, s.id))).run(); }
export function recoverQuickOperations(now = new Date().toISOString()) { return getDb().$client.prepare("UPDATE quick_operations SET status='indeterminate',finished_at=? WHERE status='running'").run(now).changes; }
function grant(userId: string, id: string, cardId: string, kind: "initial" | "supplemental", now: string) { const p = { id: randomUUID(), userId, attemptId: id, cardId, kind, grantedAt: now, closedAt: null, limitsJson: JSON.stringify(quickBudget[kind].limits), usedJson: JSON.stringify({ followups: 0, checks: 0, retries: 0 }) }; getDb().insert(quickPackages).values(p).run(); return p; }
function reserve(op: Operation, frozen: Frozen, retry: boolean, now: string): Reservation {
  const db = getDb(), p = pack(op.userId, op.attemptId);
  if (!p || p.id !== op.packageId) throw new SessionError("这份额度包已关闭。", 409, "quota_exhausted");
  const used = usage(p), limits = quickBudget[p.kind], field = retry ? "retries" : op.kind === "check" ? "checks" : "followups";
  if (used[field] >= limits[field]) throw new SessionError("本包额度已用完，可手动编辑、写成作文或稍后申请补充检查。", 409, "quota_exhausted");
  const attempt = (db.$client.prepare("SELECT count(*) n FROM llm_calls WHERE user_id=? AND operation_id=?").get(op.userId, op.id) as { n: number }).n;
  const schema = op.kind === "check" ? checkSchema : followSchema;
  const inputTokens = estimateInputTokens(buildMessages(instructionFor(op, frozen), frozen.context, schema as z.ZodType, attempt));
  const result = reserveCall({ userId: op.userId, sessionId: op.attemptId, operationId: op.id, packageId: p.id, purpose: op.kind === "check" ? "quick_check" : "quick_followup", perCall: { inputTokens, maxOutputTokens: op.kind === "check" ? 768 : 512 }, packageLimits: limits.limits, now });
  if (!result.ok) throw new SessionError(result.reason === "input_too_long" ? "输入过长，请缩短卡片或对话；内容已保留。" : `额度不足，${result.retryAt ? `可于 ${result.retryAt} 后重试` : "可手动编辑或写成作文"}。`, result.reason === "input_too_long" ? 422 : 429, result.reason);
  used[field]++; db.update(quickPackages).set({ usedJson: JSON.stringify(used) }).where(eq(quickPackages.id, p.id)).run();
  db.update(quickOperations).set({ status: "running", finishedAt: null }).where(eq(quickOperations.id, op.id)).run();
  return result.reservation;
}
export async function runQuickModel(userId: string, id: string, raw: QuickModelAction) {
  const input = quickModelActionSchema.parse(raw), db = getDb();
  const prepared = db.$client.transaction(() => {
    const now = new Date().toISOString(), session = getSession(userId, id); assertQuickSession(session);
    // Doc §4.2: a request with text settles its receipt first; without text the original order stays.
    const askText = input.action === "quickFollowup" ? input.text : undefined;
    const closed = () => { if (session.lifecycle === "closed") throw new SessionError("练习已关闭。", 409); };
    if (askText === undefined) closed();
    const card = getCard(userId, id)!;
    const { requestId, idempotencyKey, ...params } = input;
    const hash = createHash("sha256").update(JSON.stringify(params)).digest("hex"), keys = [...new Set([requestId, idempotencyKey].filter((v): v is string => !!v))];
    const receipts = keys.map(key => getRequestReceipt(db.$client, userId, key)).filter(r => r !== null);
    for (const r of receipts) if (r.attemptId !== id || r.action !== input.action || r.paramsHash !== hash || r.resultRef !== receipts[0].resultRef) throw new ReceiptConflict();
    const receipt = (ref: string) => { for (const key of keys) writeRequestReceipt(db.$client, { userId, idempotencyKey: key, attemptId: id, action: input.action, paramsHash: hash, resultRef: ref, createdAt: now }); session.completedRequests = [...(session.completedRequests ?? []), ...keys].slice(-50); session.lastStudentActionAt = now; persist(userId, session, now); };
    if (receipts.length) {
      // An identical replay of a text request is read-only: no new receipt rows, no session write.
      if (askText !== undefined && receipts.length === keys.length) return null;
      receipt(receipts[0].resultRef); return null;
    }
    if (askText !== undefined) closed();
    let p = pack(userId, id);
    if (input.action === "quickSupplemental") {
      if (!p || Date.parse(now) < Date.parse(p.grantedAt) + quickBudget.supplemental.cooldownMs) throw new SessionError(`补充检查需间隔 24 小时。可申请时间：${p ? new Date(Date.parse(p.grantedAt) + 86400000).toISOString() : "尚未开始初始包"}`, 409, "supplemental_cooldown");
      const checks = db.select().from(quickOperations).where(scope(userId, id)).all().filter(o => o.kind === "check");
      const last = checks.at(-1);
      if (checks.some(o => o.status === "running") || (card.lastCheckedVersion === card.contentVersion && !last?.status.match(/invalid_output|timeout|indeterminate/))) throw new SessionError("请先修改卡片内容，或重试技术失败的检查。", 409, "unchanged_card");
      db.update(quickPackages).set({ closedAt: now }).where(eq(quickPackages.id, p.id)).run(); p = grant(userId, id, card.id, "supplemental", now); receipt(p.id); return null;
    }
    let op: Operation | undefined, frozen: Frozen;
    if (input.action === "quickRetry") {
      op = db.select().from(quickOperations).where(and(scope(userId, id), eq(quickOperations.id, input.operationId))).get();
      if (!op) throw new SessionError("操作不存在。", 404);
      if (op.status === "running") return null;
      if (!["invalid_output", "timeout", "indeterminate"].includes(op.status)) throw new SessionError("只有技术失败可以重试。", 409);
      const row = db.select().from(quickOperationInputs).where(eq(quickOperationInputs.operationId, op.id)).get();
      if (!row) throw new SessionError("冻结输入不存在。", 404);
      frozen = JSON.parse(row.inputJson);
    } else {
      if (card.contentVersion !== input.cardVersion) throw new SessionError("卡片版本冲突，请刷新。", 409, "card_conflict");
      const kind = input.action === "quickCheck" ? "check" : "followup";
      const followups = session.messages.filter(m => m.action === "quickFollowup" && m.role === "coach");
      const last = followups.at(-1);
      const pending = last && !session.messages.some(m => m.replyToMessageId === last.id && m.role === "user");
      const slot = kind === "check" ? `check:v${card.contentVersion}` : `followup:${pending ? followups.length : followups.length + 1}`;
      op = db.select().from(quickOperations).where(and(scope(userId, id), eq(quickOperations.slot, slot), eq(quickOperations.kind, kind))).get();
      // The student speaks first: refuse instead of replaying, so their text is never stored without a coach reply.
      if (askText !== undefined) {
        if (pending) throw new SessionError("请先回答教练的上一个问题。", 409, "followup_pending");
        if (op) throw new SessionError("上一次追问还没有完成，请稍等或先重试。", 409, "followup_unfinished");
        // Persisted by receipt() below; any later throw (reserve, config) rolls it back with the operation.
        session.messages.push({ id: randomUUID(), userId, role: "user", stage: "quick", action: "quickAsk", content: askText, afterFollowUp: followups.length as 0 | 1 | 2 });
      }
      if (op) {
        const active = pack(userId, id);
        if (kind === "check" && active?.kind === "supplemental" && active.id !== op.packageId && ["invalid_output", "timeout", "indeterminate"].includes(op.status)) {
          const saved = db.select().from(quickOperationInputs).where(eq(quickOperationInputs.operationId, op.id)).get();
          if (!saved) throw new SessionError("冻结输入不存在。", 404);
          op = { ...op, packageId: active.id };
          db.update(quickOperations).set({ packageId: active.id }).where(eq(quickOperations.id, op.id)).run();
          const frozen: Frozen = JSON.parse(saved.inputJson);
          const reservation = reserve(op, frozen, false, now); receipt(op.id); return { op, frozen, reservation };
        }
        receipt(op.id); return null;
      }
      if (kind === "check") {
        const checked = db.select().from(quickCheckResults).where(and(eq(quickCheckResults.userId, userId), eq(quickCheckResults.attemptId, id), eq(quickCheckResults.cardVersion, card.contentVersion))).get();
        if (checked) { receipt(checked.checkId); return null; }
      }
      const reqs = quickRequirements(cardRequirements(card), card.content);
      frozen = { kind, ...(askText !== undefined ? { variant: "ask" as const } : {}), configVersion: callConfigVersion, context: { task: session.prompt.text, requirements: kind === "followup" ? reqs : reqs.filter(r => !r.empty), parts: card.content.parts.map(({ key, text }) => ({ key, text })), ...(kind === "followup" ? { coachingFocus: card.content.parts.some(p => p.key.endsWith(".answer") && !card.content.parts.some(other => other.key === p.key.replace(/\.answer$/, ".why"))) ? "explain_reason" as const : "develop" as const, messages: session.messages.filter(m => m.stage === "quick").map(m => ({ role: m.role, content: m.content })) } : {}) }, empty: reqs.filter(r => r.empty).map(r => ({ id: r.id, status: "gap", note: emptyNote(cardSlots(cardRequirements(card)).filter(s => s.requirementKey === r.id && !card.content.parts.some(p => p.key === s.key && p.text.trim())).map(s => s.label)) })) };
      if (kind === "check" && reqs.every(r => r.empty)) {
        const checkId = randomUUID(); db.insert(quickCheckResults).values({ checkId, userId, attemptId: id, cardVersion: card.contentVersion, outcome: "needs_development", resultsJson: JSON.stringify(frozen.empty), createdAt: now }).run();
        db.update(topicCards).set({ state: "needs_development", lastCheckId: checkId, lastCheckedVersion: card.contentVersion }).where(eq(topicCards.id, card.id)).run(); receipt(checkId); return null;
      }
      getLlmConfig();
      p ??= grant(userId, id, card.id, "initial", now);
      op = { id: randomUUID(), userId, attemptId: id, cardId: card.id, cardVersion: card.contentVersion, kind, slot, packageId: p.id, status: "running", startedAt: now, finishedAt: null };
      db.insert(quickOperations).values(op).run(); db.insert(quickOperationInputs).values({ operationId: op.id, userId, attemptId: id, inputJson: JSON.stringify(frozen) }).run();
    }
    const reservation = reserve(op, frozen, input.action === "quickRetry", now); receipt(op.id); return { op, frozen, reservation };
  }).immediate();
  if (!prepared) return response(userId, id);
  let { reservation } = prepared;
  const { op, frozen } = prepared;
  for (let attempt = 0; attempt < 2; attempt++) {
    let result: z.infer<typeof followSchema> | z.infer<typeof checkSchema>;
    try {
      const options = { callSite: op.kind === "check" ? "quick.check" as const : "quick.followup" as const, userId, sessionId: id, operationId: op.id, purpose: op.kind === "check" ? "quick_check" as const : "quick_followup" as const, reservation, maxInputTokens: 4000, retries: 0 };
      result = op.kind === "check" ? await generateJson(instruction.check, frozen.context, checkSchema, options) : await generateJson(instructionFor(op, frozen), frozen.context, followSchema, options);
      if ("results" in result) {
        const ids = frozen.context.requirements.map(r => r.id);
        if (result.results.length !== ids.length || new Set(result.results.map(r => r.id)).size !== ids.length || result.results.some(r => !ids.includes(r.id) || !validQuickNote(r.note) || (r.status === "gap" ? !r.note : r.note !== null))) throw new Error("invalid_output");
      } else if (!validQuickQuestion(result.question) || (result.targetKey !== null && ![...frozen.context.requirements.flatMap(r => r.keys), ...frozen.context.parts.map(p => p.key)].includes(result.targetKey))) throw new Error("invalid_output");
    } catch (error) {
      const call = db.$client.prepare("SELECT outcome FROM llm_calls WHERE id=?").get(reservation.id) as { outcome: string } | undefined;
      const invalid = error instanceof Error && error.message === "invalid_output" || call?.outcome === "invalid_output";
      if (invalid) db.$client.prepare("UPDATE llm_calls SET outcome='invalid_output' WHERE id=? AND outcome='ok'").run(reservation.id);
      const status = invalid ? "invalid_output" : call?.outcome === "timeout" ? "timeout" : "indeterminate";
      db.update(quickOperations).set({ status, finishedAt: new Date().toISOString() }).where(and(eq(quickOperations.id, op.id), eq(quickOperations.status, "running"))).run();
      if (invalid && attempt === 0) { try { reservation = db.$client.transaction(() => { if (!getSession(userId, id)) throw new SessionError("练习不存在", 404); return reserve(op, frozen, true, new Date().toISOString()); }).immediate(); continue; } catch { /* original failure remains */ } }
      break;
    }
    try { db.$client.transaction(() => {
      const now = new Date().toISOString(), session = getSession(userId, id), card = getCard(userId, id);
      const current = db.select().from(quickOperations).where(eq(quickOperations.id, op.id)).get();
      if (!current || current.status !== "running") return;
      if (!session || !card || session.lifecycle === "closed" || (op.kind === "check" && card.contentVersion !== op.cardVersion)) { db.update(quickOperations).set({ status: "stale", finishedAt: now }).where(eq(quickOperations.id, op.id)).run(); return; }
      if ("question" in result) {
        session.messages.push({ id: randomUUID(), role: "coach", stage: "quick", action: "quickFollowup", content: result.question, ...(result.targetKey ? { targetKey: result.targetKey } : {}) }); persist(userId, session, now);
        db.update(quickOperations).set({ status: "ok", finishedAt: now }).where(eq(quickOperations.id, op.id)).run();
      } else {
        const results = [...frozen.empty, ...result.results], passed = results.every(r => r.status === "met"), state = passed ? "passed" : "needs_development";
        db.insert(quickCheckResults).values({ checkId: op.id, userId, attemptId: id, cardVersion: op.cardVersion, outcome: state, resultsJson: JSON.stringify(results), createdAt: now }).run();
        db.update(topicCards).set({ state, lastCheckId: op.id, lastCheckedVersion: op.cardVersion }).where(eq(topicCards.id, card.id)).run();
        if (passed) db.insert(completionEvents).values({ userId, attemptId: id, activity: "quick", exposureKey: session.question?.exposureKey, questionId: card.questionId, primaryTopic: session.question?.primaryTopic, questionType: session.question?.questionType, completedAt: now, freshness: "unknown", relation: "none" }).onConflictDoNothing().run();
        db.update(quickOperations).set({ status: passed ? "ok" : "needs_development", finishedAt: now }).where(eq(quickOperations.id, op.id)).run();
      }
    }).immediate(); } catch {
      // The result transaction rolled back; keep charged calls and expose an explicit
      // technical retry instead of leaving a running operation until restart.
      try { db.update(quickOperations).set({ status: "indeterminate", finishedAt: new Date().toISOString() }).where(and(eq(quickOperations.id, op.id), eq(quickOperations.status, "running"))).run(); }
      catch { console.error("quick result recovery failed; reservation retained until startup recovery"); }
    }
    break;
  }
  return response(userId, id);
}
