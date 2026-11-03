import { z } from "zod";
import { prompt, renderPrompt } from "./prompts";

export type ModelMessage = { role: "system" | "user"; content: string };
export function buildMessages<T>(instruction: string, context: unknown, schema: z.ZodType<T>, attempt = 0): ModelMessage[] {
  const shape = z.toJSONSchema(schema);
  return [
    { role: "system", content: `${renderPrompt("system/preamble", { schema: JSON.stringify(shape) })}\n${instruction}${attempt ? `\n${prompt("system/retry")}` : ""}` },
    { role: "user", content: JSON.stringify(context) },
  ];
}

/** Conservative admission estimate, NOT provider usage. One token per UTF-8
 * byte deliberately overestimates ordinary byte-tokenized text (including CJK).
 * Count the serialized messages, plus protocol envelopes/special tokens. This
 * is a versioned heuristic, not a tokenizer guarantee for arbitrary providers.
 * Change inputEstimateVersion if the formula or protocol allowance changes. */
export function estimateInputTokens(messages: readonly ModelMessage[]): number {
  return Buffer.byteLength(JSON.stringify(messages), "utf8") + 256 + messages.length * 32;
}
