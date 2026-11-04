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
    // Full model request/response retention; stays off until the privacy notice is published.
    LLM_PAYLOADS_ENABLED: env.LLM_PAYLOADS_ENABLED === "true",
  };
}

/** The privacy notice describes Agent Tutor and payload retention; show it once either is live. */
export function privacyNoticeVisible(env: Record<string, string | undefined> = process.env) {
  const flags = readFeatures(env);
  return flags.TUTOR_V2_ENABLED || flags.LLM_PAYLOADS_ENABLED;
}
