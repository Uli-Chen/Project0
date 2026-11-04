import "server-only";

/** Read at runtime; no feature is enabled merely by installing this module. */
export function readFeatures(env: Record<string, string | undefined> = process.env) {
  const QUESTION_BANK_ENABLED = env.QUESTION_BANK_ENABLED === "true";
  return {
    QUESTION_BANK_ENABLED,
    TUTOR_V2_ENABLED: env.TUTOR_V2_ENABLED === "true",
    QUICK_ENABLED: QUESTION_BANK_ENABLED && env.QUICK_ENABLED === "true",
    CHECKPOINTS_ENABLED: QUESTION_BANK_ENABLED && env.CHECKPOINTS_ENABLED === "true",
    FOCUS_ENABLED: env.FOCUS_ENABLED === "true",
  };
}
