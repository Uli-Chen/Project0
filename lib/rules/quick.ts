import type { QuestionRequirements } from "../question-bank/types";
import { cardSlots } from "../quick/layouts";
import type { CardContent } from "../quick/schemas";
export function quickRequirements(requirements: QuestionRequirements, content: CardContent) {
  const slots = cardSlots(requirements);
  return requirements.subquestions.map(q => {
    const keys = slots.filter(s => s.requirementKey === q.key).map(s => s.key);
    return { id: q.key, zh: q.zh, keys, empty: keys.some(key => !content.parts.some(p => p.key === key && p.text.trim())) };
  });
}
export function validQuickNote(note: string | null) {
  return note === null || ([...note].length <= 60 && !/(?:[A-Za-z]+[\s,;:]+){5}[A-Za-z]+/.test(note));
}

/** A single terminal question, not multiple questions hidden in one field. */
export function validQuickQuestion(question: string) {
  return [...question].length <= 80 && /[?？]$/.test(question) && (question.match(/[?？]/g)?.length ?? 0) === 1;
}
