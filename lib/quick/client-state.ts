/** Reject late snapshots from before a mutation or a newer applied read. */
export type SnapshotVersion = { session: { version: number }; card: { contentVersion: number } };
export function acceptQuickSnapshot(current: SnapshotVersion, incoming: SnapshotVersion, ticket: { epoch: number; sequence: number }, latest: { epoch: number; sequence: number }) {
  return ticket.epoch === latest.epoch && ticket.sequence >= latest.sequence && incoming.session.version >= current.session.version && incoming.card.contentVersion >= current.card.contentVersion;
}
/** A synchronous latch closes the gap before React commits disabled buttons. */
export function createIntentLatch() {
  let busy = false;
  return { enter() { if (busy) return false; busy = true; return true; }, leave() { busy = false; }, get busy() { return busy; } };
}
export function unchangedDraft(currentRevision: number, savedRevision: number) { return currentRevision === savedRevision; }

export function persistedIntentKey(storage: { getItem(key: string): string | null; setItem(key: string, value: string): void } | null, name: string, create: () => string) {
  let key: string | null = null;
  try { key = storage?.getItem(name) ?? null; } catch { /* memory fallback */ }
  key ??= create();
  try { storage?.setItem(name, key); } catch { /* memory fallback */ }
  return key;
}
