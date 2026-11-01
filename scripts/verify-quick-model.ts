/** Bounded release probe: synthetic data, temporary SQLite, <=6 provider requests. */
import { loadEnvConfig } from "@next/env";
import { mkdirSync, writeFileSync } from "node:fs";
import { quickFixture } from "../tests/helpers/quick-api";
import { getCard } from "../lib/db/queries/cards";
import { runQuickModel } from "../lib/pipeline/quick-model";
import { commitQuickMutation } from "../lib/pipeline/quick";
import { getLlmConfig } from "../lib/llm/config";
async function main() {
loadEnvConfig(process.cwd());
const hasKey = Boolean(process.env.LLM_API_KEY); console.log(JSON.stringify({ hasKey }));
if (!hasKey) process.exit(2);
const f = quickFixture();
const originalFetch = globalThis.fetch;
let calls = 0, networkBlocked = false;
const requests: { number: number; outputCap: number; latencyMs: number; httpStatus?: number; errorCategory?: string; thinkingDisabled: boolean }[] = [];
globalThis.fetch = async (url, init) => {
  if (calls >= 6) throw new Error("probe_provider_cap");
  const n = ++calls, start = Date.now(), body = JSON.parse(String(init?.body));
  try {
    const response = await originalFetch(url, init);
    requests.push({ number: n, outputCap: body.max_tokens, thinkingDisabled: body.thinking?.type === "disabled", latencyMs: Date.now() - start, httpStatus: response.status });
    return response;
  } catch (error) {
    const cause = error instanceof Error ? (error.cause as { code?: string } | undefined)?.code : undefined;
    const errorCategory = cause ?? (error instanceof Error ? error.name : "unknown");
    if (["ENOTFOUND", "EAI_AGAIN", "EPERM", "EACCES", "ECONNREFUSED"].includes(errorCategory)) networkBlocked = true;
    requests.push({ number: n, outputCap: body.max_tokens, thinkingDisabled: body.thinking?.type === "disabled", latencyMs: Date.now() - start, errorCategory });
    throw error;
  }
};
const cases = [
  { questionId: "qb_mock_edu_004", layout: "position_reasons", parts: { "position.answer": "我赞成学校通常要求校服，但应给经济困难家庭补助。", "position.why": "统一服装可减少学生对名牌的攀比，使注意力更多放在学习上。" } },
  { questionId: "qb_mock_health_001", layout: "problem_solution", parts: { "reasons.answer": "久坐和方便购买的高糖食品让肥胖及不健康饮食增多。", "reasons.why": "工作繁忙的人常靠快餐解决用餐，摄入的能量可能超过消耗。", "most_effective_prevention.answer": "我认为改善学校和工作场所的健康餐供应最有效。", "most_effective_prevention.why": "价格便宜而方便的健康餐能改变每天的选择，比偶尔宣传更持久。" } },
  { questionId: "qb_mock_edu_003", layout: "both_views_opinion", parts: { "mathematics.answer": "数学训练有助于学生理解数据并作出判断。", "mathematics.why": "购物和工作中的费用比较都需要基本数字能力。", "communication.answer": "沟通技能帮助学生表达想法并与他人合作。", "communication.why": "团队成员如果不能说清需求，就很难共同完成任务。", "opinion.answer": "两种技能都应保留，但我更重视沟通练习。", "opinion.why": "多数工作要与他人合作，清楚表达也能帮助分享数学分析。" } },
];
const results: unknown[] = [];
try {
  for (const c of cases) {
    if (networkBlocked || calls >= 6) break;
    const response = await f.call("create", "", { questionId: c.questionId, activity: "quick", mode: "practice", idempotencyKey: crypto.randomUUID() });
    if (response.status !== 201) throw new Error(`probe_create_${response.status}`);
    const id = (await response.json()).session.id as string;
    commitQuickMutation("u", id, { action: "cardSave", cardVersion: 0, parts: Object.entries(c.parts).map(([key, text]) => ({ key, text: text! })) });
    for (const action of ["quickFollowup", "quickCheck"] as const) {
      if (networkBlocked || calls >= 6) break;
      const start = Date.now(), before = calls;
      try {
        const result = await runQuickModel("u", id, { action, cardVersion: getCard("u", id)!.contentVersion });
        results.push({ questionId: c.questionId, layout: c.layout, action, latencyMs: Date.now() - start, providerCalls: calls - before, operations: result.operations.map(o => ({ kind: o.kind, status: o.status })), cardState: result.card.state });
      } catch (error) {
        results.push({ questionId: c.questionId, layout: c.layout, action, latencyMs: Date.now() - start, providerCalls: calls - before, errorCategory: error instanceof Error ? error.name : "unknown", code: (error as { code?: string }).code ?? null });
      }
      console.log(JSON.stringify(results.at(-1)));
    }
  }
  const ledger = f.db.$client.prepare("SELECT purpose,attempt,model,config_version,reserved_input,reserved_output,reserved_ms,input_tokens,output_tokens,latency_ms,outcome FROM llm_calls ORDER BY rowid").all();
  const report = { timestamp: new Date().toISOString(), model: getLlmConfig().model, syntheticInputs: true, temporaryDatabase: true, providerLimit: 6, providerCalls: calls, networkBlocked, requests, results, ledger };
  mkdirSync("docs/plans/reports/WP8_e2e", { recursive: true });
  writeFileSync("docs/plans/reports/WP8_e2e/real-model-probe-no-thinking.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ providerCalls: calls, networkBlocked, ledger }));
} finally { globalThis.fetch = originalFetch; f.close(); }
if (networkBlocked) process.exit(42);

}
main().catch(() => { console.error("probe failed; no secrets logged"); process.exitCode = 1; });
