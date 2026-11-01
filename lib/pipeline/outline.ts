import type { Outline } from "@/lib/prototype/types";
import { slotPathSchema } from "./schemas";
export function getSlot(outline: Outline, path: string) {
  const [head, index, field] = path.split(".");
  if (head === "stance") return outline.stance;
  if (head === "counter") return outline.counter[index as "view" | "response"];
  return outline.reasons[Number(index)]?.[field as "claim" | "why" | "example"] ?? null;
}
export function setSlot(outline: Outline, path: string, text: string | null, source: string): Outline {
  slotPathSchema.parse(path);
  const value = text?.trim() ? { text: text.trim(), sources: [source] } : null;
  const next = structuredClone(outline);
  const [head, index, field] = path.split(".");
  if (head === "stance") next.stance = value;
  else if (head === "counter") next.counter[index as "view" | "response"] = value;
  else next.reasons[Number(index)][field as "claim" | "why" | "example"] = value;
  return next;
}
