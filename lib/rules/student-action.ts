import type { AgentAction } from "../pipeline/schemas";
import type { SessionState } from "../pipeline/types";

type Editable = Pick<SessionState, "drafts" | "outline">;
type Event = { kind: "draft"; before: Editable; after: Editable }
  | { kind: "action"; action: AgentAction["action"] }
  | { kind: "lifecycle" }
  | { kind: "read" | "automaticReview" };

/** RFC §3/§6: recommendation recency follows student intent, never polling or model completion. */
function outlineText(outline: Editable["outline"]) {
  return [outline.stance?.text ?? null, ...outline.reasons.flatMap(r => [r.claim?.text ?? null, r.why?.text ?? null, r.example?.text ?? null]), outline.counter.view?.text ?? null, outline.counter.response?.text ?? null];
}
export function isStudentAction(event: Event): boolean {
  if (event.kind === "draft") return event.before.drafts.original !== event.after.drafts.original || event.before.drafts.revision !== event.after.drafts.revision
    || JSON.stringify(outlineText(event.before.outline)) !== JSON.stringify(outlineText(event.after.outline));
  if (event.kind === "action") return event.action !== "nudge"; // requested automatically by the editor
  return event.kind === "lifecycle";
}
