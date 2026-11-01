import { quickBudget, type BudgetLimits } from "../llm/budget";

export type CallOutcome = "reserved" | "ok" | "timeout" | "invalid_output" | "provider_error" | "indeterminate";
export type CallAccounting = {
  package_id: string | null; started_at: string; outcome: CallOutcome;
  input_tokens: number | null; output_tokens: number | null; latency_ms: number | null;
  reserved_input: number; reserved_output: number; reserved_ms: number;
};
export type QuotaRejection = { ok: false; reason: "user_quota" | "package_quota" | "input_too_long"; retryAt: string | null };
export function occupiedBudget(rows: readonly CallAccounting[]): BudgetLimits {
  return rows.reduce((total, row) => {
    const uncertain = row.outcome === "reserved" || row.outcome === "indeterminate";
    return {
      calls: total.calls + 1,
      inputTokens: total.inputTokens + (uncertain ? row.reserved_input : row.input_tokens ?? row.reserved_input),
      outputTokens: total.outputTokens + (uncertain ? row.reserved_output : row.output_tokens ?? row.reserved_output),
      // A timeout cannot prove the provider stopped: charge at least its reserved wait.
      waitMs: total.waitMs + (uncertain ? row.reserved_ms : row.outcome === "timeout" ? Math.max(row.reserved_ms, row.latency_ms ?? 0) : row.latency_ms ?? row.reserved_ms),
    };
  }, { calls: 0, inputTokens: 0, outputTokens: 0, waitMs: 0 });
}

/** RFC §8: user window is (now - 24h, now]; package usage is lifetime. */
export function decideReservation(rows: readonly CallAccounting[], packageId: string, packageLimits: BudgetLimits, perCall: { inputTokens: number; maxOutputTokens: number }, now: string): QuotaRejection | { ok: true; reservedMs: number } {
  if (perCall.inputTokens > quickBudget.perCall.inputTokens) return { ok: false, reason: "input_too_long", retryAt: null };
  const timestamp = Date.parse(now);
  const userRows = rows.filter(row => row.package_id !== null && Date.parse(row.started_at) > timestamp - quickBudget.user.windowMs && Date.parse(row.started_at) <= timestamp);
  const user = occupiedBudget(userRows), pack = occupiedBudget(rows.filter(row => row.package_id === packageId));
  const fits = (used: BudgetLimits, limit: BudgetLimits) => used.calls + 1 <= limit.calls && used.inputTokens + perCall.inputTokens <= limit.inputTokens && used.outputTokens + perCall.maxOutputTokens <= limit.outputTokens && used.waitMs < limit.waitMs;
  if (!fits(user, quickBudget.user.limits)) return { ok: false, reason: "user_quota", retryAt: userRows.length ? new Date(Math.min(...userRows.map(row => Date.parse(row.started_at))) + quickBudget.user.windowMs).toISOString() : null };
  if (!fits(pack, packageLimits)) return { ok: false, reason: "package_quota", retryAt: null };
  return { ok: true, reservedMs: Math.min(quickBudget.perCall.timeoutMs, packageLimits.waitMs - pack.waitMs, quickBudget.user.limits.waitMs - user.waitMs) };
}
