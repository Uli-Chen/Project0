/** Small release behaviour sample using synthetic text; never the application DB. */
import { loadEnvConfig } from "@next/env";
import { mkdirSync, writeFileSync } from "node:fs";
import { quickFixture } from "../tests/helpers/quick-api";
import { getCard } from "../lib/db/queries/cards";
import { runQuickModel } from "../lib/pipeline/quick-model";
import { commitQuickMutation } from "../lib/pipeline/quick";
async function main() {
  loadEnvConfig(process.cwd());
  console.log(JSON.stringify({ hasKey: Boolean(process.env.LLM_API_KEY) }));
  if (!process.env.LLM_API_KEY) process.exit(2);
  const f = quickFixture(), realFetch = globalThis.fetch;
  let calls = 0, networkBlocked = false;
  globalThis.fetch = async (...args) => {
    if (calls >= 6) throw new Error("probe_provider_cap");
    calls++;
    try { return await realFetch(...args); }
    catch (error) {
      const code = error instanceof Error ? (error.cause as { code?: string } | undefined)?.code : undefined;
      if (code && ["ENOTFOUND", "EAI_AGAIN", "EPERM", "EACCES", "ECONNREFUSED"].includes(code)) networkBlocked = true;
      throw error;
    }
  };
  const results: unknown[] = [];
  async function create(questionId: string, parts: Record<string, string>) {
    const response = await f.call("create", "", { questionId, activity: "quick", mode: "practice", idempotencyKey: crypto.randomUUID() });
    if (response.status !== 201) throw new Error("probe_create_failed");
    const id = (await response.json()).session.id as string;
    commitQuickMutation("u", id, { action: "cardSave", cardVersion: 0, parts: Object.entries(parts).map(([key, text]) => ({ key, text })) });
    return id;
  }
  async function sample(caseId: number, scenario: string, id: string, action: "quickFollowup" | "quickCheck") {
    if (networkBlocked || calls >= 6) { results.push({ caseId, scenario, skipped: true }); return; }
    const start = Date.now(), before = calls;
    const result = await runQuickModel("u", id, { action, cardVersion: getCard("u", id)!.contentVersion });
    const evidence = { caseId, scenario, action, providerCalls: calls - before, latencyMs: Date.now() - start,
      task: result.session.prompt.text, cardParts: result.card.content.parts.map(p => ({ key: p.key, text: p.text })),
      conversation: result.session.messages.filter(m => m.stage === "quick").map(m => ({ role: m.role, text: m.content })),
      cardState: result.card.state, checks: result.checkResults.map(r => ({ outcome: r.outcome, results: r.results })),
      operations: result.operations.map(o => ({ kind: o.kind, status: o.status })) };
    results.push(evidence); console.log(JSON.stringify(evidence));
  }
  try {
    const stance = await create("qb_mock_edu_004", { "position.answer": "我赞成学校通常要求学生穿校服。" });
    await sample(16, "卡片只有立场：应只追问一个问题，不代写理由", stance, "quickFollowup");
    if (!networkBlocked && calls < 6) {
      commitQuickMutation("u", stance, { action: "quickAnswer", text: "不知道为什么。" });
      await sample(17, "学生回答不知道：给思考方向，不提供论点", stance, "quickFollowup");
    }
    const noWhy = await create("qb_mock_edu_004", { "position.answer": "我赞成学校强制学生穿校服。", "position.why": "因为校服很好，穿校服很重要，所以应该穿。" });
    await sample(18, "有理由槽文字但没有因果解释：应判缺口，不给示范", noWhy, "quickCheck");
    const missing = await create("qb_mock_health_001", { "reasons.answer": "久坐和方便购买的高糖食品让肥胖及不健康饮食增多。", "reasons.why": "工作繁忙的人常靠快餐解决用餐，摄入的能量可能超过消耗。" });
    await sample(19, "双问题仅回答原因，未答最有效预防措施：应判缺口", missing, "quickCheck");
    const ordinary = await create("qb_mock_edu_003", { "mathematics.answer": "数学训练有助于学生理解数据并作出判断。", "mathematics.why": "购物和工作中的费用比较都需要基本数字能力。", "communication.answer": "沟通技能帮助学生表达想法并与他人合作。", "communication.why": "团队成员如果不能说清需求，就很难共同完成任务。", "opinion.answer": "两种技能都应保留，但我更重视沟通练习。", "opinion.why": "多数工作要与他人合作，清楚表达也能帮助分享数学分析。" });
    await sample(20, "观点普通但要求均完整：应判断满足，不以观点新奇度评分", ordinary, "quickCheck");
    const ledger = f.db.$client.prepare("SELECT purpose,attempt,reserved_output,reserved_ms,input_tokens,output_tokens,latency_ms,outcome,config_version FROM llm_calls ORDER BY rowid").all();
    mkdirSync("docs/plans/reports/WP8_e2e", { recursive: true });
    writeFileSync("docs/plans/reports/WP8_e2e/coach-behavior-16-20-revised.json", JSON.stringify({ timestamp: new Date().toISOString(), synthetic: true, temporaryDatabase: true, providerCap: 6, providerCalls: calls, networkBlocked, results, ledger }, null, 2) + "\n");
    console.log(JSON.stringify({ providerCalls: calls, networkBlocked }));
  } finally { globalThis.fetch = realFetch; f.close(); }
  if (networkBlocked) process.exit(42);
}
main().catch(() => { console.error("behaviour probe failed; no secrets logged"); process.exitCode = 1; });
