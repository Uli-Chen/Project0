import type { QuestionRequirements } from "../question-bank/types";

// Layout determines fields inside a group, never the questions/groups themselves.
export const layoutFields = {
  position_reasons: [{ key: "answer", label: "立场" }, { key: "why", label: "理由" }],
  both_views_opinion: [{ key: "answer", label: "观点" }, { key: "why", label: "理由" }],
  weigh: [{ key: "advantages", label: "好处" }, { key: "disadvantages", label: "坏处" }, { key: "answer", label: "权衡结论" }, { key: "why", label: "比较依据" }],
  problem_solution: [{ key: "answer", label: "回答" }, { key: "why", label: "解释" }],
  two_questions: [{ key: "answer", label: "回答" }, { key: "why", label: "理由" }],
} as const;
export function cardSlots(requirements: QuestionRequirements) {
  return requirements.subquestions.flatMap(q => layoutFields[requirements.layout].map(field => ({
    key: `${q.key}.${field.key}`, requirementKey: q.key, en: q.en, zh: q.zh, label: field.label,
  })));
}
