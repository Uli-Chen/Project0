import { createHash } from "node:crypto";
import { callSites, type CallSite, type StageGroup } from "./call-sites";
import { promptFingerprint } from "./prompts";
import { writeCallPayload } from "./payloads";
import { recordCallMetadata, type ResultMetadata } from "./calls";
import "server-only";
import { z } from "zod";
import { admitModelCall } from "./admission";
import { getLlmConfig, quickProviderOptions } from "./config";
import { ModelError, parseModelJson, providerError } from "./json";
import { buildCoachMessages } from "./coach-messages";
import { buildMessages, estimateInputTokens } from "./messages";
import { consumeReservation, observeCall, settleCall, type CallRecord, type CallOutcome, type CallUsage, type Reservation } from "./calls";
import type { LlmPurpose } from "./budget";

export { buildMessages, estimateInputTokens } from "./messages";
export type GenerateJsonOptions = {
  purpose: LlmPurpose; userId?: string; sessionId?: string | null; operationId?: string; reservation?: Reservation;
  maxInputTokens?: number; maxOutputTokens?: number; timeoutMs?: number;
  /** Additional invalid/incomplete-output attempts; default 1 (two total).
   * Coach v2 shares at most two attempts with known transient network retries.
   * A reservation always permits exactly one attempt, regardless of retries. */
  retries?: number;
  coachV2?: boolean;
  callSite?: CallSite; stageGroup?: StageGroup;
  onSuccess?: (metadata: { callId: string }) => void;
  resultMetadata?: (result: unknown) => ResultMetadata;
};
function readUsage(payload: unknown): CallUsage | null {
  const result = z.object({ usage: z.object({ prompt_tokens: z.number().int().nonnegative().nullish(), completion_tokens: z.number().int().nonnegative().nullish(), completion_tokens_details: z.object({ reasoning_tokens: z.number().int().nonnegative().nullish() }).nullish() }) }).safeParse(payload);
  return result.success ? { inputTokens: result.data.usage.prompt_tokens ?? null, outputTokens: result.data.usage.completion_tokens ?? null, reasoningTokens: result.data.usage.completion_tokens_details?.reasoning_tokens ?? null } : null;
}

const transientNetworkCodes = new Set(["ECONNRESET", "EPIPE", "UND_ERR_SOCKET", "EAI_AGAIN", "ETIMEDOUT"]);
function isTransientNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // Fetch/body failures carry the transport error in cause. Do not infer
  // retryability from provider text, generic TypeErrors, or abort messages.
  let cause: unknown = error.cause;
  for (let depth = 0; depth < 4 && typeof cause === "object" && cause !== null; depth++) {
    if ("code" in cause && typeof cause.code === "string" && transientNetworkCodes.has(cause.code)) return true;
    cause = "cause" in cause ? cause.cause : undefined;
  }
  return false;
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
  const messageBuilder = options?.coachV2 ? buildCoachMessages : buildMessages;
  const firstMessages = messageBuilder(instruction, context, schema, reservation ? reservation.attempt - 1 : 0);
  const started = Date.now();
  const requestedAttempts = 1 + (options?.retries ?? 1);
  const attempts = reservation ? 1 : options?.coachV2 ? Math.min(2, requestedAttempts) : requestedAttempts;
  let formatRetry = (reservation?.attempt ?? 1) > 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const retryHint = options?.coachV2 ? formatRetry : (reservation ? reservation.attempt - 1 : attempt) > 0;
    const messages = attempt === 0 ? firstMessages : messageBuilder(instruction, context, schema, retryHint ? 1 : 0);
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
    const requestBody = JSON.stringify({ model: config.model, max_tokens: maxOutputTokens, response_format: { type: "json_object" }, messages, ...quickProviderOptions(config, options?.purpose) });
    const site = options?.callSite ?? (options?.purpose === "quick_check" ? "quick.check" : options?.purpose === "quick_followup" ? "quick.followup" : undefined);
    if (call) recordCallMetadata(call, { callSite: site, stageGroup: options?.stageGroup ?? (site ? callSites[site].group : undefined), provider: new URL(config.baseUrl).hostname, promptVersion: promptFingerprint(instruction, options?.coachV2, retryHint, messages[0].content), paramsHash: createHash("sha256").update(JSON.stringify({ model: config.model, max_tokens: maxOutputTokens, response_format: { type: "json_object" }, ...quickProviderOptions(config, options?.purpose) })).digest("hex") });
    let responseText: string | null = null, finishReason: string | null = null;
    let usage: CallUsage | null = null;
    let outcome: Exclude<CallOutcome, "reserved"> = "indeterminate";
    let signal: AbortSignal | undefined;
    try {
      signal = AbortSignal.timeout(timeoutMs);
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" }, cache: "no-store",
        body: requestBody, signal,
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
      finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : null;
      responseText = typeof choice?.message?.content === "string" ? choice.message.content : null;
      if (choice?.finish_reason !== "stop" || typeof choice?.message?.content !== "string") throw new ModelError("模型输出未完成，请重试。");
      const result = parseModelJson(choice.message.content, schema);
      outcome = "ok";
      if (call) {
        try { if (options?.resultMetadata) recordCallMetadata(call, options.resultMetadata(result)); options?.onSuccess?.({ callId: call.id }); } catch { console.error("llm result observation failed"); }
      }
      return result;
    } catch (error) {
      // A disconnected response can also say "aborted". For logged calls only
      // our deadline (or a provider TimeoutError) proves a timeout; otherwise
      // keep indeterminate reservations. Preserve legacy error wording.
      if (signal?.aborted || (error instanceof Error && (error.name === "TimeoutError" || (!options && /timeout|abort/i.test(`${error.name} ${error.message}`))))) outcome = "timeout";
      if (error instanceof ModelError && attempt + 1 < attempts && Date.now() - started < 70000 && /格式|不完整|未完成/.test(error.message)) { formatRetry = true; continue; }
      if (options?.coachV2 && !reservation && outcome === "indeterminate" && attempt + 1 < attempts
        && Date.now() - started < 70000 && (options.timeoutMs ?? 120000) - (Date.now() - started) >= 1000
        && isTransientNetworkError(error)) { formatRetry = false; continue; }
      if (error instanceof ModelError) throw error;
      if (outcome === "timeout" || (options?.callSite?.startsWith("deep.") && error instanceof Error && /timeout|abort/i.test(`${error.name} ${error.message}`))) throw new ModelError("模型响应超时，请重试。你的文字已经保留。");
      throw new ModelError("无法连接模型服务，请稍后重试。");
    } finally {
      if (call) { settleCall(call, { usage, latencyMs: Math.max(0, Date.now() - callStarted), outcome, finishReason }); writeCallPayload(call, requestBody, responseText); }
    }
  }
  throw new ModelError("模型暂时无法完成请求，请重试。");
}
