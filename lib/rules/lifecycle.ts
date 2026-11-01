import type { SessionState } from "../pipeline/types";

export function nextLifecycle(current: SessionState["lifecycle"], action: "setAside" | "resume" | "close") {
  if (action === "resume") return "open";
  if (action === "close") return "closed";
  return current === "closed" ? null : "set_aside";
}
