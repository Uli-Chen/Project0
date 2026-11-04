import type { LlmPurpose } from "./budget";
export type StageGroup = "prewrite" | "assist" | "revise" | "nudge" | "judge" | "quick";
export const callSites = {
  "deep.prewrite": { purpose: "prewrite_turn", group: "prewrite" },
  "deep.chat": { purpose: "writing_chat", group: "assist" },
  "deep.clarify": { purpose: "writing_chat", group: "assist" },
  "deep.polish": { purpose: "writing_assist", group: "assist" },
  "deep.express": { purpose: "writing_assist", group: "assist" },
  "deep.check": { purpose: "writing_check", group: "assist" },
  "deep.issue": { purpose: "issue_hint", group: "revise" },
  "deep.nudge": { purpose: "nudge", group: "nudge" },
  "deep.evaluate": { purpose: "scoring", group: "judge" },
  "deep.compare": { purpose: "comparison", group: "judge" },
  "deep.review": { purpose: "feedback_review", group: "judge" },
  "deep.finish": { purpose: "memory_summary", group: "judge" },
  "quick.followup": { purpose: "quick_followup", group: "quick" },
  "quick.check": { purpose: "quick_check", group: "judge" },
} as const satisfies Record<string, { purpose: LlmPurpose; group: StageGroup }>;
export type CallSite = keyof typeof callSites;
