import { z } from "zod";

// 模型接口配置。接口为 OpenAI 兼容格式；结构化输出只支持 response_format json_object（不支持 json_schema），
// 推理模型的思考过程计入 max_tokens，调用时需要留足额度。
const llmEnvironment = z.object({
  LLM_BASE_URL: z.url().default("https://api.deepseek.com"),
  LLM_API_KEY: z.string().trim().min(1, "缺少 LLM_API_KEY，请写入 .env.local"),
  LLM_MODEL: z.string().trim().min(1).default("deepseek-flash"),
});

export function getLlmConfig() {
  const env = llmEnvironment.parse(process.env);
  return {
    baseUrl: env.LLM_BASE_URL.replace(/\/+$/, ""),
    apiKey: env.LLM_API_KEY,
    model: env.LLM_MODEL,
  };
}

/** Official DeepSeek defaults to thinking; its hidden reasoning shares Quick's
 * small output ceiling. Disable it only for Quick at the official provider.
 * Scoring, other purposes and compatible providers retain their existing body.
 * https://api-docs.deepseek.com/guides/thinking_mode/
 */
export function quickProviderOptions(config: { baseUrl: string; model: string }, purpose?: string) {
  return (purpose === "quick_followup" || purpose === "quick_check")
    && new URL(config.baseUrl).hostname === "api.deepseek.com" && /^deepseek(?:-|$)/i.test(config.model)
    ? { thinking: { type: "disabled" as const } } : {};
}
