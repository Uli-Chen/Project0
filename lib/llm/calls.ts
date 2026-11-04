import "server-only";
import type Database from "better-sqlite3";
import { z } from "zod";
import { getDb } from "../db/client";
import { decideReservation, type CallAccounting, type CallOutcome, type QuotaRejection } from "../rules/llm-budget";
import { callConfigVersion, llmPurposes, quickBudget, type BudgetLimits, type LlmPurpose, type QuickPurpose } from "./budget";

export type CallUsage = { inputTokens: number | null; outputTokens: number | null; reasoningTokens?: number | null };
export type CallRecord = Readonly<{
  id: string; userId: string; sessionId: string | null; operationId: string | null; packageId: string | null;
  purpose: LlmPurpose; attempt: number; model: string; configVersion: string; startedAt: string;
  reservedInput: number; reservedOutput: number; reservedMs: number;
}>;
export type Reservation = CallRecord & { readonly packageId: string; readonly operationId: string; readonly purpose: QuickPurpose };
export type ReserveCallInput = {
  userId: string; operationId: string; packageId: string; purpose: QuickPurpose; sessionId: string | null;
  perCall: { inputTokens: number; maxOutputTokens: number }; packageLimits: BudgetLimits; now: string;
};
export type ReserveCallResult = { ok: true; reservation: Reservation } | QuotaRejection;
// Only an object issued by a successful reservation in this process may be
// dispatched, once. Startup recovery handles reservations from an old process.
const availableReservations = new WeakSet<Reservation>();
const count = z.number().int().nonnegative();
const identifier = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_.:-]+$/);
const metadata = z.object({ userId: identifier, sessionId: identifier.nullable(), operationId: identifier.nullable(), purpose: z.enum(llmPurposes) });
const limits = z.object({ calls: count, inputTokens: count, outputTokens: count, waitMs: count });
const reserveInput = metadata.extend({ operationId: identifier, packageId: identifier, purpose: z.enum(["quick_followup", "quick_check"]), perCall: z.object({ inputTokens: count, maxOutputTokens: count.positive() }), packageLimits: limits, now: z.iso.datetime() });
const settlement = z.object({ finishReason: z.string().nullable().optional(), usage: z.object({ inputTokens: count.nullable(), outputTokens: count.nullable(), reasoningTokens: count.nullable().optional() }).nullable(), latencyMs: count, outcome: z.enum(["ok", "timeout", "invalid_output", "provider_error", "indeterminate"]) });
export type CallSettlement = z.infer<typeof settlement>;

function insertCall(sqlite: Database.Database, call: CallRecord) {
  sqlite.prepare(`INSERT INTO llm_calls(id,user_id,session_id,purpose,operation_id,package_id,attempt,model,config_version,started_at,reserved_input,reserved_output,reserved_ms,outcome)
    VALUES(@id,@userId,@sessionId,@purpose,@operationId,@packageId,@attempt,@model,@configVersion,@startedAt,@reservedInput,@reservedOutput,@reservedMs,'reserved')`).run(call);
}

/** Caller must await outer transaction commit before dispatch. If composing
 * with WP4's operation/input writes, the OUTER transaction must be IMMEDIATE;
 * better-sqlite3 nests this transaction as a savepoint on that same connection.
 * Denial inserts nothing. Persistence errors deliberately propagate. */
export function reserveCall(input: ReserveCallInput, sqlite = getDb().$client): ReserveCallResult {
  reserveInput.parse(input);
  const outputCap = input.purpose === "quick_followup" ? quickBudget.perCall.followupOutputTokens : quickBudget.perCall.checkOutputTokens;
  if (input.perCall.maxOutputTokens > outputCap) throw new RangeError("Output reservation exceeds purpose ceiling");
  return sqlite.transaction((): ReserveCallResult => {
    const cutoff = new Date(Date.parse(input.now) - quickBudget.user.windowMs).toISOString();
    const rows = sqlite.prepare("SELECT * FROM llm_calls WHERE user_id = ? AND package_id IS NOT NULL AND (package_id = ? OR started_at > ?)").all(input.userId, input.packageId, cutoff) as CallAccounting[];
    const decision = decideReservation(rows, input.packageId, input.packageLimits, input.perCall, input.now);
    if (!decision.ok) return decision;
    const { attempt } = sqlite.prepare("SELECT COALESCE(MAX(attempt), 0) + 1 AS attempt FROM llm_calls WHERE user_id = ? AND operation_id = ?").get(input.userId, input.operationId) as { attempt: number };
    const reservation: Reservation = Object.freeze({
      id: crypto.randomUUID(), userId: input.userId, sessionId: input.sessionId, operationId: input.operationId,
      packageId: input.packageId, purpose: input.purpose, attempt, model: process.env.LLM_MODEL?.trim() || "deepseek-flash",
      configVersion: callConfigVersion, startedAt: input.now, reservedInput: input.perCall.inputTokens,
      reservedOutput: input.perCall.maxOutputTokens, reservedMs: decision.reservedMs,
    });
    insertCall(sqlite, reservation);
    availableReservations.add(reservation);
    return { ok: true, reservation };
  }).immediate();
}

/** Observational calls never occupy Quick quotas; failures are non-fatal and
 * never log database/provider error objects, which could contain content. */
export function observeCall(input: Omit<CallRecord, "id" | "packageId" | "configVersion">, sqlite?: Database.Database): CallRecord | null {
  try {
    metadata.parse(input);
    const call: CallRecord = { ...input, id: crypto.randomUUID(), packageId: null, configVersion: callConfigVersion };
    insertCall(sqlite ?? getDb().$client, call);
    return call;
  } catch { console.error("llm_calls observation write failed"); return null; }
}

/** One atomic update; a failure leaves the entire reservation intact. Late
 * responses after recovery cannot release indeterminate capacity. */
export function settleCall(reservation: CallRecord, result: CallSettlement, sqlite?: Database.Database): void {
  try {
    const parsed = settlement.parse(result);
    (sqlite ?? getDb().$client).prepare(`UPDATE llm_calls SET input_tokens = ?, output_tokens = ?, latency_ms = ?, outcome = ?, finish_reason = ?, reasoning_tokens = ?
      WHERE id = ? AND user_id = ? AND outcome = 'reserved'`).run(parsed.usage?.inputTokens ?? null, parsed.usage?.outputTokens ?? null, parsed.latencyMs, parsed.outcome, parsed.finishReason ?? null, parsed.usage?.reasoningTokens ?? null, reservation.id, reservation.userId);
  } catch { console.error("llm_calls settlement failed; reservation retained"); }
}

export function recoverInflightCalls(now: string, sqlite = getDb().$client): number {
  z.iso.datetime().parse(now);
  // Recovery time is not model wait time. Do not invent latency or usage.
  return sqlite.prepare("UPDATE llm_calls SET outcome = 'indeterminate' WHERE outcome = 'reserved'").run().changes;
}

/** Refuse rolled-back, settled, recovered or mismatched reservations before fetch. */
export function consumeReservation(reservation: Reservation, expected: { userId?: string; sessionId?: string | null; operationId?: string; purpose: LlmPurpose; inputTokens: number; model: string }, sqlite = getDb().$client): void {
  if (sqlite.inTransaction) throw new Error("Model dispatch must be outside a transaction");
  const row = sqlite.prepare("SELECT * FROM llm_calls WHERE id = ? AND user_id = ?").get(reservation.id, reservation.userId) as (CallAccounting & { operation_id: string; session_id: string | null; purpose: string; model: string; config_version: string; attempt: number }) | undefined;
  if (!availableReservations.has(reservation) || !row || row.outcome !== "reserved" || row.package_id !== reservation.packageId || row.operation_id !== reservation.operationId || row.session_id !== reservation.sessionId || row.purpose !== reservation.purpose || row.model !== expected.model || row.config_version !== reservation.configVersion || row.attempt !== reservation.attempt || row.reserved_input !== reservation.reservedInput || row.reserved_output !== reservation.reservedOutput || row.reserved_ms !== reservation.reservedMs || expected.purpose !== reservation.purpose || (expected.userId !== undefined && expected.userId !== reservation.userId) || (expected.sessionId !== undefined && expected.sessionId !== reservation.sessionId) || (expected.operationId !== undefined && expected.operationId !== reservation.operationId)) throw new Error("Reservation is not available for this call");
  if (expected.inputTokens > row.reserved_input) throw new Error("input_too_long: actual messages exceed reservation");
  availableReservations.delete(reservation);
}

export type { CallOutcome };

export type ResultMetadata = { move?: string; allowedHelp?: number; providedHelp?: number; warnings?: Record<string, number> };
export function recordCallMetadata(call: CallRecord, data: { callSite?: string; stageGroup?: string; provider?: string; promptVersion?: string; paramsHash?: string } & ResultMetadata) {
  try {
    const values: Record<string, string | number | null> = {};
    for (const [key, column] of Object.entries({callSite:"call_site",stageGroup:"stage_group",provider:"provider",promptVersion:"prompt_version",paramsHash:"params_hash",move:"move",allowedHelp:"allowed_help",providedHelp:"provided_help",warnings:"warnings_json"})) {
      const value = data[key as keyof typeof data];
      if(value !== undefined) values[column] = typeof value === "object" ? JSON.stringify(value) : value;
    }
    const keys = Object.keys(values); if (!keys.length) return;
    getDb().$client.prepare(`UPDATE llm_calls SET ${keys.map(key=>`${key} = ?`).join(",")} WHERE id = ? AND user_id = ?`).run(...Object.values(values), call.id, call.userId);
  } catch { console.error("llm metadata write failed"); }
}
