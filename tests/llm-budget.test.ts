import assert from "node:assert/strict";
import { test } from "node:test";
import { quickBudget } from "../lib/llm/budget";
import { decideReservation, occupiedBudget, type CallAccounting } from "../lib/rules/llm-budget";
const now = "2026-11-01T12:00:00.000Z";
const row: CallAccounting = { package_id: "p", started_at: now, outcome: "ok", input_tokens: 10, output_tokens: 20, latency_ms: 30, reserved_input: 100, reserved_output: 200, reserved_ms: 25000 };
const perCall = { inputTokens: 100, maxOutputTokens: 768 };
const large = { calls: 100, inputTokens: 100000, outputTokens: 100000, waitMs: 1000000 };

test("预算常量完整对应 RFC §8 初始包、补充包、单次和用户四项上限", () => {
  assert.deepEqual(quickBudget.initial, { followups: 2, checks: 2, retries: 1, limits: { calls: 5, inputTokens: 20000, outputTokens: 3328, waitMs: 100000 } });
  assert.deepEqual(quickBudget.supplemental, { followups: 0, checks: 1, retries: 1, cooldownMs: 86400000, limits: { calls: 2, inputTokens: 8000, outputTokens: 1536, waitMs: 50000 } });
  assert.deepEqual(quickBudget.perCall, { inputTokens: 4000, followupOutputTokens: 512, checkOutputTokens: 768, timeoutMs: 25000 });
  assert.deepEqual(quickBudget.user, { windowMs: 86400000, limits: { calls: 15, inputTokens: 60000, outputTokens: 12000, waitMs: 300000 } });
});
test("核销按实际；单项未知按预留；reserved 和 indeterminate 三项均保留预留", () => {
  assert.deepEqual(occupiedBudget([row]), { calls: 1, inputTokens: 10, outputTokens: 20, waitMs: 30 });
  assert.deepEqual(occupiedBudget([{ ...row, input_tokens: null }]), { calls: 1, inputTokens: 100, outputTokens: 20, waitMs: 30 });
  for (const outcome of ["reserved", "indeterminate"] as const) assert.deepEqual(occupiedBudget([{ ...row, outcome }]), { calls: 1, inputTokens: 100, outputTokens: 200, waitMs: 25000 });
  assert.equal(occupiedBudget([{ ...row, outcome: "timeout" }]).waitMs, 25000);
});
for (const dimension of ["calls", "inputTokens", "outputTokens", "waitMs"] as const) {
  test(`包 ${dimension} 上限独立生效`, () => {
    const used = occupiedBudget([row]);
    const result = decideReservation([row], "p", { ...large, [dimension]: used[dimension] }, perCall, now);
    assert.deepEqual(result, { ok: false, reason: "package_quota", retryAt: null });
  });
  test(`用户 ${dimension} 上限独立生效且换包/操作/练习不能重置`, () => {
    const used = { ...row, package_id: "other" };
    let rows = [used];
    if (dimension === "calls") rows = Array.from({ length: 15 }, () => used);
    if (dimension === "inputTokens") used.input_tokens = 60000;
    if (dimension === "outputTokens") used.output_tokens = 12000;
    if (dimension === "waitMs") used.latency_ms = 300000;
    assert.deepEqual(decideReservation(rows, "new", large, perCall, now), { ok: false, reason: "user_quota", retryAt: "2026-11-02T12:00:00.000Z" });
  });
}
test("24 小时左开右闭；精练不占用户额度；过期包仍按生命周期计费", () => {
  const exhausted = Array.from({ length: 15 }, () => row);
  assert.equal(decideReservation(exhausted, "new", large, perCall, "2026-11-02T11:59:59.999Z").ok, false);
  assert.equal(decideReservation(exhausted, "new", large, perCall, "2026-11-02T12:00:00.000Z").ok, true);
  assert.equal(decideReservation(exhausted.map(r => ({ ...r, package_id: null })), "new", large, perCall, now).ok, true);
  assert.deepEqual(decideReservation(exhausted, "p", quickBudget.initial.limits, perCall, "2026-11-02T12:00:00.000Z"), { ok: false, reason: "package_quota", retryAt: null });
});
test("等待时间取单次/包/用户剩余最小值；输入超长拒绝而不截断", () => {
  assert.deepEqual(decideReservation([], "p", large, perCall, now), { ok: true, reservedMs: 25000 });
  assert.deepEqual(decideReservation([], "p", { ...large, waitMs: 1234 }, perCall, now), { ok: true, reservedMs: 1234 });
  assert.deepEqual(decideReservation([{ ...row, package_id: "old", latency_ms: 299999 }], "p", large, perCall, now), { ok: true, reservedMs: 1 });
  assert.deepEqual(decideReservation([], "p", large, { ...perCall, inputTokens: 4001 }, now), { ok: false, reason: "input_too_long", retryAt: null });
  assert.equal(decideReservation([], "p", large, { ...perCall, inputTokens: 4000 }, now).ok, true);
});
