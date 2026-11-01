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
