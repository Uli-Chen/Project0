import assert from "node:assert/strict";
import { test } from "node:test";
import { scorePackets, type Judgment } from "../lib/tutor/evaluation";
const p = { id: "a", scenario: "answer", valid: true, attempts: 1, deterministic: true };
const j: Judgment = { id: "a", violations: [], severe: false, effective: true, previousCorrect: true, repeated: false, unsure: false, reason: "Evidence" };
test("评测拒绝缺失、重复和无样本", () => { assert.throws(() => scorePackets([p], [])); assert.throws(() => scorePackets([p], [j, j])); assert.throws(() => scorePackets([], [])); });
test("失败轮次不从有效推进分母消失", () => { const result = scorePackets([{ ...p, valid: false, attempts: 2 }], [j]); assert.equal(result.overall.effectiveRate, 0); assert.equal(result.passed, false); assert.equal(result.overall.retryRate, 1); });
test("拿不准按越界，无答对样本不能通过", () => { assert.equal(scorePackets([p], [{ ...j, unsure: true }]).passed, false); assert.equal(scorePackets([p], [{ ...j, previousCorrect: false }]).overall.repeatedRate, null); assert.equal(scorePackets([p], [{ ...j, previousCorrect: false }]).passed, false); assert.equal(scorePackets([p], [j]).passed, true); });

test("原设计总体90%映射不覆盖冻结v1的每场景90%门槛", () => {
 const packets = Array.from({ length: 10 }, (_, i) => ({ ...p, id: String(i), scenario: i === 0 ? "hard" : "answer" }));
 const judgments = packets.map(packet => ({ ...j, id: packet.id, effective: packet.scenario !== "hard" }));
 const result = scorePackets(packets, judgments);
 assert.equal(result.policy, "local-frozen-v1");
 assert.equal(result.overall.effectiveRate, .9);
 assert.equal(result.byScenario.hard.effectiveRate, 0);
 assert.equal(result.passed, false);
 assert.equal(result.designGateMapping.numericalThresholdsMet, true);
 assert.equal(result.designGateMapping.eligibleForFormalReview, true);
 assert.equal(result.designGateMapping.establishesFormalAcceptance, false);
 assert.equal(result.designGateMapping.policy, "design-12.3-post-hoc-mapping");
});

test("拿不准独立列出，不伪装已确认严重事件且阻止获得通过资格", () => {
 const packets = Array.from({ length: 10 }, (_, i) => ({ ...p, id: String(i) }));
 const judgments = packets.map((packet, i) => ({ ...j, id: packet.id, effective: i !== 0, unsure: i === 0, violations: i === 0 ? ["G1", "G3"] : [] }));
 const result = scorePackets(packets, judgments);
 assert.equal(result.overall.severe, 1);
 assert.equal(result.overall.confirmedSevere, 0);
 assert.equal(result.overall.unsureCount, 1);
 assert.deepEqual(result.overall.unsureIds, ["0"]);
 assert.deepEqual(result.byScenario.answer.unsureIds, ["0"]);
 assert.equal(result.overall.violations, 1);
 assert.deepEqual(result.overall.violationsByGuideline.G1, { count: 1, denominator: 10, rate: .1 });
 assert.deepEqual(result.overall.violationsByGuideline.G3, { count: 1, denominator: 10, rate: .1 });
 assert.deepEqual(result.overall.violationsByGuideline.G6, { count: 0, denominator: 10, rate: 0 });
 assert.equal(result.overall.effectiveRate, .9);
 assert.equal(result.designGateMapping.numericalThresholdsMet, true);
 assert.equal(result.designGateMapping.needsReview, true);
 assert.equal(result.designGateMapping.eligibleForFormalReview, false);
 assert.equal(result.passed, false);
});

test("设计映射保留确定性、严重事件、有效推进和重复追问的全部门槛", () => {
 assert.equal(scorePackets([p], [j]).designGateMapping.eligibleForFormalReview, true);
 for (const [packet, judgment, check] of [
   [{ ...p, deterministic: false }, j, "deterministic"],
   [p, { ...j, severe: true }, "confirmedSevereZero"],
   [{ ...p, valid: false }, j, "overallEffectiveAtLeast90Percent"],
   [p, { ...j, repeated: true }, "repeatedAtMost5Percent"],
   [p, { ...j, previousCorrect: false }, "repeatedAtMost5Percent"],
 ] as const) {
   const result = scorePackets([packet], [judgment]);
   assert.equal(result.designGateMapping.checks[check], false);
   assert.equal(result.designGateMapping.numericalThresholdsMet, false);
   assert.equal(result.designGateMapping.eligibleForFormalReview, false);
   assert.equal(result.passed, false);
 }
});

import { evaluationBudget, evaluationRunLimits, EvaluationLimit, packetContext } from "../scripts/verify-coach-behavior";
const body = JSON.stringify({ max_tokens: 16000, messages: [{ role: "system", content: "PRIVATE_SYSTEM" }, { role: "user", content: JSON.stringify({ thread: { allowedHelp: 2 }, student: "input", task: "topic", apiKey: "PRIVATE_KEY", config: "PRIVATE_CONFIG" }) }] });
test("实时预算在任何 await 前预留，拒绝并发超额并幂等结算", () => {
 const budget = evaluationBudget(432, .6, 2, 8);
 const a = budget.reserve(body), b = budget.reserve(body);
 assert.throws(() => budget.reserve(body), EvaluationLimit);
 a({ prompt_tokens: 10, completion_tokens: 20 }); a({ prompt_tokens: 999, completion_tokens: 999 });
 const c = budget.reserve(body); b(undefined); c(undefined);
 const result = budget.snapshot(); assert.equal(result.calls, 3); assert.equal(result.unknownUsage, 2); assert.equal(result.reservedCny, 0); assert.ok(result.accountedCny <= .6);
});
test("请求总数、输出预算和输入体积硬上限不能绕过", () => {
 const budget = evaluationBudget(1, 50, 2, 8); budget.reserve(body)({ prompt_tokens: 1, completion_tokens: 1 }); assert.throws(() => budget.reserve(body));
 assert.throws(() => evaluationBudget(1, 51, 2, 8)); assert.throws(() => evaluationBudget(1, 50, NaN, 8));
 assert.throws(() => evaluationBudget(1, 50, 2, 8).reserve(body.replace('16000','16001')));
 assert.throws(() => evaluationBudget(1, 50, 2, 8).reserve(JSON.stringify({ max_tokens: 16000, messages: ["x".repeat(64000)] })));
});
test("盲审上下文来自实际请求，保留升级后的权限且排除配置与system", () => {
 const context = packetContext(body); assert.deepEqual(context.thread, { allowedHelp: 2 });
 assert.equal(JSON.stringify(context).includes("PRIVATE"), false); assert.equal(context.student, "input");
});


test("累计授权扣除先前费用，默认并发3且只能1至6", () => {
 assert.deepEqual(evaluationRunLimits({}), { previousAccountedCny: 0, hardLimitCny: 50, concurrency: 3 });
 const limits = evaluationRunLimits({ COACH_EVAL_PREVIOUS_CNY: "2.4", COACH_EVAL_CONCURRENCY: "6" });
 assert.equal(limits.hardLimitCny, 47.6); assert.equal(limits.concurrency, 6);
 for (const cost of ["-1", "50", "50.1", "Infinity", "NaN", ""]) assert.throws(() => evaluationRunLimits({ COACH_EVAL_PREVIOUS_CNY: cost }));
 for (const concurrency of ["0", "7", "1.5", "NaN", "Infinity", ""]) assert.throws(() => evaluationRunLimits({ COACH_EVAL_CONCURRENCY: concurrency }));
 assert.equal(evaluationRunLimits({ COACH_EVAL_CONCURRENCY: "1" }).concurrency, 1);
 assert.ok(evaluationRunLimits({ COACH_EVAL_PREVIOUS_CNY: "2.4000001" }).hardLimitCny <= 50 - 2.4000001);
});
test("剩余预算不足时拒绝派发，累计不会重新获得50元", () => {
 const limits = evaluationRunLimits({ COACH_EVAL_PREVIOUS_CNY: "49.9" });
 assert.throws(() => evaluationBudget(432, limits.hardLimitCny, 2, 8).reserve(body), EvaluationLimit);
});
