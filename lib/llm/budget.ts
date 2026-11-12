/** RFC §8 provisional ceilings. All durations are milliseconds. */
export const budgetConfigVersion = "quick-budget-20261101-v1";
export const promptConfigVersion = "coach-json-v15-quick-ask";
export const inputEstimateVersion = "utf8-byte-v1";
export const quickProviderPolicyVersion = "quick-deepseek-no-thinking-v1";
// config_version covers prompts, limits, admission estimate and Quick provider policy.
export const callConfigVersion = `${promptConfigVersion}/${budgetConfigVersion}/${inputEstimateVersion}/${quickProviderPolicyVersion}`;
export type BudgetLimits = { calls: number; inputTokens: number; outputTokens: number; waitMs: number };
export const quickBudget = {
  initial: { followups: 2, checks: 2, retries: 1, limits: { calls: 5, inputTokens: 20_000, outputTokens: 3_328, waitMs: 100_000 } },
  supplemental: { followups: 0, checks: 1, retries: 1, cooldownMs: 86_400_000, limits: { calls: 2, inputTokens: 8_000, outputTokens: 1_536, waitMs: 50_000 } },
  perCall: { inputTokens: 4_000, followupOutputTokens: 512, checkOutputTokens: 768, timeoutMs: 25_000 },
  user: { windowMs: 86_400_000, limits: { calls: 15, inputTokens: 60_000, outputTokens: 12_000, waitMs: 300_000 } },
} as const;
export const llmPurposes = ["writing_check", "memory_summary", "prewrite_turn", "writing_assist", "writing_chat", "nudge", "scoring", "diagnosis", "feedback_review", "issue_hint", "comparison", "idea_extract", "opening", "quick_followup", "quick_check"] as const;
export type LlmPurpose = typeof llmPurposes[number];
export type QuickPurpose = "quick_followup" | "quick_check";
