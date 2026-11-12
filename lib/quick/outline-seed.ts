import type { Outline, Slot } from "../prototype/types";
import type { QuestionRequirements } from "../question-bank/types";
import type { CardContent } from "./schemas";

/** Marks outline text that was carried over verbatim from the student's own topic card. */
export const cardSource = "速刷卡片";

/** Carry the student's own card text into the Deep outline when a card becomes an essay.
 * Only text the student wrote is copied; an empty card field leaves its slot empty. */
export function outlineFromCard(requirements: QuestionRequirements, content: CardContent): Outline {
  const slot = (key: string): Slot => {
    const text = content.parts.find(part => part.key === key)?.text.trim();
    return text ? { text: text.slice(0, 2000), sources: [cardSource] } : null;
  };
  const outline: Outline = { stance: null, reasons: [{ claim: null, why: null, example: null }, { claim: null, why: null, example: null }], counter: { view: null, response: null }, userEdited: false };
  const keys = requirements.subquestions.map(q => q.key);
  if (requirements.layout === "weigh") {
    outline.stance = slot(`${keys[0]}.answer`);
    outline.reasons[0].claim = slot(`${keys[0]}.advantages`);
    outline.reasons[1].claim = slot(`${keys[0]}.disadvantages`);
    outline.counter.view = slot(`${keys[0]}.why`);
  } else if (keys.length === 1) {
    outline.stance = slot(`${keys[0]}.answer`);
    outline.reasons[0].claim = slot(`${keys[0]}.why`);
  } else {
    for (const index of [0, 1]) {
      outline.reasons[index].claim = slot(`${keys[index]}.answer`);
      outline.reasons[index].why = slot(`${keys[index]}.why`);
    }
    if (keys[2]) {
      outline.stance = slot(`${keys[2]}.answer`);
      outline.counter.view = slot(`${keys[2]}.why`);
    }
  }
  return outline;
}

export function outlineHasContent(outline: Outline) {
  return Boolean(outline.stance || outline.reasons.some(r => r.claim || r.why || r.example) || outline.counter.view || outline.counter.response);
}
