import type { SessionState } from "./types";
export type EditGenerations = { original: number; revision: number; outline: number; nudgesEnabled: number };
/** Responses can arrive after a poll or after the next local edit; neither may roll newer work back. */
export function mergeSessionState(local: SessionState, incoming: SessionState, changed: EditGenerations, generation: number): SessionState {
  if (incoming.version < local.version) return local;
  // The optimistic echo of a message being sent lives only on the client. A poll that lands
  // before the reply must not erase it; drop it once the request is recorded or has failed.
  const echoes = local.messages.filter(m => m.id.startsWith("pending-") && !incoming.completedRequests?.includes(m.id.slice(8)) && !incoming.pendingAction?.error && !incoming.messages.some(i => i.id === m.id));
  return { ...incoming,
    messages: echoes.length ? [...incoming.messages, ...echoes] : incoming.messages,
    drafts: { original: changed.original > generation ? local.drafts.original : incoming.drafts.original, revision: changed.revision > generation ? local.drafts.revision : incoming.drafts.revision },
    outline: changed.outline > generation ? local.outline : incoming.outline,
    nudgesEnabled: changed.nudgesEnabled > generation ? local.nudgesEnabled : incoming.nudgesEnabled,
    elapsed: { original: Math.max(incoming.elapsed.original, local.elapsed.original), revision: Math.max(incoming.elapsed.revision, local.elapsed.revision) },
    // Entering revision carries the server-validated openIssue selection.
    activeIssue: local.stage === incoming.stage ? local.activeIssue : incoming.activeIssue,
  };
}
