import "./load-env";
import { getLlmConfig } from "../lib/llm/config";

// 检查模型接口是否可用：一次普通回复、一次 JSON 输出。不打印密钥。
const { baseUrl, apiKey, model } = getLlmConfig();

async function chat(body: Record<string, unknown>) {
  const started = Date.now();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 800, ...body }),
    signal: AbortSignal.timeout(60_000),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json.error ?? json)}`);
  const choice = json.choices[0];
  return { ms: Date.now() - started, content: choice.message.content as string, finish: choice.finish_reason, usage: json.usage };
}

async function main() {
  console.log(`接口：${baseUrl}\n模型：${model}`);

  const text = await chat({ messages: [{ role: "user", content: "用一句话回答：1+1 等于几？" }] });
  console.log(`\n普通回复 ${text.ms}ms，${text.finish}，${text.usage?.total_tokens} tokens\n  ${text.content}`);

  const structured = await chat({
    max_tokens: 4000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: '只输出 JSON：{"band": number, "reason": string}' },
      { role: "user", content: "给这句话的语法打分（0–9）：<essay>The government need to use tax money.</essay>" },
    ],
  });
  if (structured.finish !== "stop") {
    throw new Error(`JSON 输出被截断（finish_reason=${structured.finish}，推理用了 ${structured.usage?.completion_tokens_details?.reasoning_tokens} tokens）`);
  }
  const parsed = JSON.parse(structured.content) as { band: unknown; reason: unknown };
  console.log(`\nJSON 输出 ${structured.ms}ms，${structured.finish}，band=${String(parsed.band)}\n  ${String(parsed.reason)}`);
  console.log("\n连通正常。");
}

main().catch((error: unknown) => {
  console.error(`\n连通失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
