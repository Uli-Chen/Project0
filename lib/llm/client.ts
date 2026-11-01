import "server-only";
import { z } from "zod";
import { admitModelCall } from "./admission";
import { getLlmConfig } from "./config";
import { ModelError, parseModelJson, providerError } from "./json";
import { buildMessages, estimateInputTokens } from "./messages";
import { consumeReservation, observeCall, settleCall, type CallRecord, type CallOutcome, type CallUsage, type Reservation } from "./calls";
import type { LlmPurpose } from "./budget";

export { buildMessages, estimateInputTokens } from "./messages";
export type GenerateJsonOptions = {
  purpose: LlmPurpose; userId?: string; sessionId?: string | null; operationId?: string; reservation?: Reservation;
  maxInputTokens?: number; maxOutputTokens?: number; timeoutMs?: number;
  /** Additional invalid/incomplete-output attempts; default 1 (two total).
   * A reservation always permits exactly one attempt, regardless of retries. */
  retries?: number;
};
function readUsage(payload: unknown): CallUsage | null {
  const result = z.object({ usage: z.object({ prompt_tokens: z.number().int().nonnegative().nullish(), completion_tokens: z.number().int().nonnegative().nullish() }) }).safeParse(payload);
  return result.success ? { inputTokens: result.data.usage.prompt_tokens ?? null, outputTokens: result.data.usage.completion_tokens ?? null } : null;
}

export async function generateJson<T>(instruction: string, context: unknown, schema: z.ZodType<T>, options?: GenerateJsonOptions): Promise<T> {
  let config: ReturnType<typeof getLlmConfig>;
  try { config = getLlmConfig(); } catch { throw new ModelError("模型服务尚未配置，请联系管理员设置模型接口。"); }
  admitModelCall();
  const reservation = options?.reservation;
  for (const value of [options?.maxInputTokens, options?.maxOutputTokens, options?.timeoutMs]) if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) throw new RangeError("Invalid model limit");
  if (options?.retries !== undefined && (!Number.isSafeInteger(options.retries) || options.retries < 0)) throw new RangeError("Invalid retries");
  // Build before the clock, as in the legacy client. Both estimate and dispatch
  // use this exact array, including any retry hint and the full JSON Schema.
  const firstMessages = buildMessages(instruction, context, schema, reservation ? reservation.attempt - 1 : 0);
  const started = Date.now();
  const attempts = reservation ? 1 : 1 + (options?.retries ?? 1);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const messages = attempt === 0 ? firstMessages : buildMessages(instruction, context, schema, attempt);
    const estimate = estimateInputTokens(messages);
    if (options?.maxInputTokens !== undefined && estimate > options.maxInputTokens) throw new ModelError("input_too_long：输入过长，请缩短后重试。你的文字已保留。", 422);
    if (reservation) consumeReservation(reservation, { ...options!, inputTokens: estimate, model: config.model });
    const timeoutMs = reservation?.reservedMs ?? Math.max(options?.timeoutMs === undefined ? 1000 : 1, (options?.timeoutMs ?? 120000) - (Date.now() - started));
    const maxOutputTokens = reservation?.reservedOutput ?? options?.maxOutputTokens ?? 16000;
    const callStarted = Date.now();
    let call: CallRecord | null = reservation ?? null;
    if (!call && options?.userId) call = observeCall({
      userId: options.userId, sessionId: options.sessionId ?? null, operationId: options.operationId ?? null, purpose: options.purpose,
      attempt: attempt + 1, model: config.model, startedAt: new Date(callStarted).toISOString(), reservedInput: estimate, reservedOutput: maxOutputTokens, reservedMs: timeoutMs,
    });
    let usage: CallUsage | null = null;
    let outcome: Exclude<CallOutcome, "reserved"> = "indeterminate";
    let signal: AbortSignal | undefined;
    try {
      signal = AbortSignal.timeout(timeoutMs);
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ model: config.model, max_tokens: maxOutputTokens, response_format: { type: "json_object" }, messages }), signal,
      });
      if (!response.ok) {
        outcome = "provider_error";
        let detail: unknown = null;
        try { detail = await response.json(); usage = readUsage(detail); } catch { /* Never expose provider bodies. */ }
        throw providerError(response.status, detail);
      }
      let payload;
      try { payload = await response.json(); }
      catch (error) { if (error instanceof SyntaxError) outcome = "invalid_output"; throw error; }
      usage = readUsage(payload);
      outcome = "invalid_output";
      const choice = payload?.choices?.[0];
      if (choice?.finish_reason !== "stop" || typeof choice?.message?.content !== "string") throw new ModelError("模型输出未完成，请重试。");
      const result = parseModelJson(choice.message.content, schema);
      outcome = "ok";
      return result;
    } catch (error) {
      // A disconnected response can also say "aborted". For logged calls only
      // our deadline (or a provider TimeoutError) proves a timeout; otherwise
      // keep indeterminate reservations. Preserve legacy error wording.
      if (signal?.aborted || (error instanceof Error && (error.name === "TimeoutError" || (!options && /timeout|abort/i.test(`${error.name} ${error.message}`))))) outcome = "timeout";
      if (error instanceof ModelError && attempt + 1 < attempts && Date.now() - started < 70000 && /格式|不完整|未完成/.test(error.message)) continue;
      if (error instanceof ModelError) throw error;
      if (outcome === "timeout") throw new ModelError("模型响应超时，请重试。你的文字已经保留。");
      throw new ModelError("无法连接模型服务，请稍后重试。");
    } finally {
      if (call) settleCall(call, { usage, latencyMs: Math.max(0, Date.now() - callStarted), outcome });
    }
  }
  throw new ModelError("模型暂时无法完成请求，请重试。");
}
