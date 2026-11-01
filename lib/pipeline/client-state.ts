import type { SessionState } from "./types";
export type EditGenerations = { original: number; revision: number; outline: number; nudgesEnabled: number };
/** Responses can arrive after a poll or after the next local edit; neither may roll newer work back. */
export function mergeSessionState(local: SessionState, incoming: SessionState, changed: EditGenerations, generation: number): SessionState {
  if (incoming.version < local.version) return local;
  return { ...incoming,
    drafts: { original: changed.original > generation ? local.drafts.original : incoming.drafts.original, revision: changed.revision > generation ? local.drafts.revision : incoming.drafts.revision },
    outline: changed.outline > generation ? local.outline : incoming.outline,
    nudgesEnabled: changed.nudgesEnabled > generation ? local.nudgesEnabled : incoming.nudgesEnabled,
    elapsed: { original: Math.max(incoming.elapsed.original, local.elapsed.original), revision: Math.max(incoming.elapsed.revision, local.elapsed.revision) }, activeIssue: local.activeIssue,
  };
}
