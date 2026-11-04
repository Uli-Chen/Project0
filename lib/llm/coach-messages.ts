import "server-only";
import { z } from "zod";
import { prompt } from "./prompts";
import type { ModelMessage } from "./messages";

/** Separate builder: legacy schema serialization and preamble remain unchanged. */
export function buildCoachMessages<T>(instruction: string, context: unknown, schema: z.ZodType<T>, attempt = 0): ModelMessage[] {
  const settings = z.object({ learner: z.object({ explainLanguage: z.enum(["en", "zh"]).nullish() }).nullish() }).safeParse(context);
  const language = settings.success && settings.data.learner?.explainLanguage === "zh" ? "zh" : "en";
  // Only the application-provided preference selects between fixed directives;
  // student text and history never become system instructions.
  const languageInstruction = prompt(language === "zh" ? "system/coach-language-zh" : "system/coach-language-en");
  return [
    { role: "system", content: `${prompt("system/coach-preamble")}\n${languageInstruction}\n${JSON.stringify(z.toJSONSchema(schema))}\n${instruction}${attempt ? `\n${prompt("system/retry")}` : ""}` },
    { role: "user", content: JSON.stringify(context) },
  ];
}
