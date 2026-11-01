import { z } from "zod";
export class ModelError extends Error {
  constructor(message: string, public status = 502, public retryAfter?: number) { super(message); }
}
export function parseModelJson<T>(content: string, schema: z.ZodType<T>): T {
  let parsed: unknown;
  try { parsed = JSON.parse(content.replace(/^\s*```(?:json)?\s*/, "").replace(/\s*```\s*$/, "")); }
  catch { throw new ModelError("模型返回的内容不完整，请重试。你的文字已保留。"); }
  const result = schema.safeParse(parsed);
  if (!result.success) throw new ModelError("模型返回的数据格式不正确，请重试。你的文字已保留。");
  return result.data;
}

/** Inspect provider error categories without reflecting upstream bodies or account details. */
export function providerError(status: number, payload: unknown): ModelError {
  const message = typeof payload === "object" && payload !== null && "error" in payload
    ? (JSON.stringify((payload as { error: unknown }).error) ?? "").slice(0, 4000) : "";
  if (/overdue.?payment|good standing|insufficient.?quota|account.*(?:disabled|suspended)|billing|credit balance|quota.*exhaust/i.test(message)) {
    return new ModelError("模型服务账户当前不可用，请联系管理员检查额度或账户状态。你的作文已保存。");
  }
  if (status === 429) return new ModelError("模型服务繁忙，请稍后重试。");
  if (status === 401 || status === 403) return new ModelError("模型接口认证失败，请联系管理员检查配置。");
  return new ModelError("模型服务暂时不可用，请稍后重试。");
}
