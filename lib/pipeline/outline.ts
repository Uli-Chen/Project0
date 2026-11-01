import type { Outline, Slot } from "@/lib/prototype/types";
import { slotPathSchema } from "./schemas";
export function getSlot(outline: Outline, path: string) {
  const [head, index, field] = path.split(".");
  if (head === "stance") return outline.stance;
  if (head === "counter") return outline.counter[index as "view" | "response"];
  return outline.reasons[Number(index)]?.[field as "claim" | "why" | "example"] ?? null;
}
export function setSlot(outline: Outline, path: string, text: string | null, source: string): Outline {
  slotPathSchema.parse(path);
  const value = text?.trim() ? { ...getSlot(outline, path), text: text.trim(), sources: [source] } : null;
  const next = structuredClone(outline);
  const [head, index, field] = path.split(".");
  if (head === "stance") next.stance = value;
  else if (head === "counter") next.counter[index as "view" | "response"] = value;
  else next.reasons[Number(index)][field as "claim" | "why" | "example"] = value;
  return next;
}

/** Draft validation strips extension keys; keep stored extensions when editing known fields. */
export function mergeOutline(current: Outline, incoming: Outline): Outline {
  const slot = (before: Slot, after: Slot): Slot => after === null ? null : { ...before, ...after };
  return { ...current, ...incoming,
    stance: slot(current.stance, incoming.stance),
    reasons: incoming.reasons.map((reason, i) => ({ ...current.reasons[i], ...reason,
      claim: slot(current.reasons[i]?.claim, reason.claim), why: slot(current.reasons[i]?.why, reason.why), example: slot(current.reasons[i]?.example, reason.example),
    })),
    counter: { ...current.counter, ...incoming.counter, view: slot(current.counter.view, incoming.counter.view), response: slot(current.counter.response, incoming.counter.response) },
  };
}
