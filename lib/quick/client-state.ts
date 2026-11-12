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

/* ---------- Requests ---------- */

export const REQUEST_TIMEOUT_MS = 20_000;
export const TIMEOUT_MESSAGE = "连接超时，内容还在本页。";
export const OFFLINE_MESSAGE = "连接中断，内容还在本页。";
/** A finished request. `uncertain`: the server may or may not have applied it (network, timeout, 5xx). */
export type Outcome = { ok: true } | { ok: false; code: string | null; message: string; uncertain: boolean };
/** Reuse the requestId while the request body stays the same, so a resend after a lost response hits the receipt. */
export function stableRequestId(previous: { key: string; id: string } | null, key: string, newId: () => string) {
  return previous?.key === key ? previous : { key, id: newId() };
}

/* ---------- Speak-first coach: send, reconcile and resend decisions ---------- */

/** Every starter the coach panel can offer. A student message equal to one of these is a
 * starter click, not the student's own idea, so it gets no "放进卡片". */
export const QUICK_STARTERS = ["我没什么思路，帮我分析一下", "这道题该从哪里想起？", "帮我把想法想得更深一点", "再问我一个问题"] as const;
export const isStarter = (text: string) => (QUICK_STARTERS as readonly string[]).includes(text);
/** Server limit for what the student says to the coach (lib/quick/schemas.ts counts JS string length). */
export const ASK_LIMIT = 1000;
/** Show the count only near the limit, like the card fields. */
export const ASK_COUNT_FROM = 900;

type Message = { id?: string; role: string; stage?: string; action?: string; content: string; replyToMessageId?: string };
/** A student message may go into the card unless it is a starter click. */
export function placeable(message: Message) { return message.role === "user" && !(message.action === "quickAsk" && isStarter(message.content)); }

export function validateAsk(raw: string): { ok: true; text: string } | { ok: false; error: string | null } {
  const text = raw.trim();
  if (!text) return { ok: false, error: null };
  if (text.length > ASK_LIMIT) return { ok: false, error: `一次最多 ${ASK_LIMIT.toLocaleString("en-US")} 字，请缩短后再发。` };
  return { ok: true, text };
}

/** The ask request exactly as it was sent. A replay reuses it unchanged (text, cardVersion, requestId). */
export type PendingAsk = { text: string; cardVersion: number; requestId: string; after: number; status: "sending" | "failed" };
const quickOnly = (messages: readonly Message[]) => messages.filter(m => m.stage === undefined || m.stage === "quick");
/** The snapshot holds this ask: a quickAsk with the same text saved after the send point. */
export function askDelivered(pending: Pick<PendingAsk, "text" | "after">, messages: readonly Message[]) {
  return quickOnly(messages).slice(pending.after).some(m => m.role === "user" && m.action === "quickAsk" && m.content === pending.text);
}
/** The local bubble shows only while the request is in flight and the snapshot does not have it yet. */
export function echoText(pending: PendingAsk | null, messages: readonly Message[]) {
  return pending?.status === "sending" && !askDelivered(pending, messages) ? pending.text : null;
}
/** A pending (unconfirmed) ask is replayed unchanged before any new intent; otherwise a new intent starts. */
export function planAsk(pending: PendingAsk | null, text: string, cardVersion: number, after: number, newId: () => string): { request: PendingAsk; replay: boolean } {
  if (pending) return { request: { ...pending, status: "sending" }, replay: true };
  return { request: { text, cardVersion, requestId: newId(), after, status: "sending" }, replay: false };
}
export type AskSettlement = {
  /** What stays unconfirmed for a later replay (null: nothing). */
  pending: PendingAsk | null;
  /** Typed text the server does not have goes back into the ask box. */
  restore: string | null;
  error: string | null;
  /** Read the server state again: the thread moved on elsewhere, or the result is unknown. */
  refresh: boolean;
  /** card_conflict: the request never reached the server; send once more as a new intent with the current card version. */
  newIntent: boolean;
};
/**
 * What a finished ask request means. `sent` is what the student sent this time (typed text or
 * a starter); it differs from `request.text` only when an earlier pending ask was replayed first.
 * `messages` is the latest snapshot: an ask it already holds is done even if the response was lost.
 */
export function settleAsk(request: PendingAsk, outcome: Outcome, sent: { text: string; typed: boolean }, messages: readonly Message[]): AskSettlement {
  if (outcome.ok || askDelivered(request, messages)) return { pending: null, restore: sent.typed && sent.text !== request.text ? sent.text : null, error: null, refresh: false, newIntent: false };
  const typed = sent.typed ? sent.text : null;
  switch (outcome.code) {
    case "card_conflict": return { pending: null, restore: null, error: null, refresh: false, newIntent: true };
    // The id belongs to other parameters: the next send starts a new intent.
    case "idempotency_conflict": return { pending: null, restore: typed, error: outcome.message, refresh: false, newIntent: false };
    // Nothing was stored under this id and the thread moved on elsewhere: show the real state.
    case "followup_pending":
    case "followup_unfinished": return { pending: null, restore: typed, error: outcome.message, refresh: true, newIntent: false };
    default: return { pending: { ...request, status: "failed" }, restore: typed, error: outcome.message, refresh: outcome.uncertain, newIntent: false };
  }
}
/** After a snapshot: a failed ask the server already has is done, and its text leaves the ask box. */
export function reconcileAsk(pending: PendingAsk | null, askDraft: string, messages: readonly Message[]): { pending: PendingAsk | null; askDraft: string } {
  if (!pending || pending.status === "sending" || !askDelivered(pending, messages)) return { pending, askDraft };
  return { pending: null, askDraft: askDraft.trim() === pending.text ? "" : askDraft };
}
/** An answer whose response was lost is done once the snapshot holds it under the same question. */
export function answerDelivered(sent: { text: string; questionId: string }, messages: readonly Message[]) {
  return messages.some(m => m.role === "user" && m.replyToMessageId === sent.questionId && m.content === sent.text.trim());
}

export type CoachBottom = "answer" | "stuck" | "used_up" | "ask";
/** Doc §4.5 bottom area, judged in order. */
export function coachBottom({ pendingAnswer, followupStuck, followupsLeft }: { pendingAnswer: boolean; followupStuck: boolean; followupsLeft: number | null }): CoachBottom {
  return pendingAnswer ? "answer" : followupStuck ? "stuck" : followupsLeft === 0 ? "used_up" : "ask";
}

/* ---------- Card fields: three-way merge after another tab saved ---------- */

/** The server stores trimmed text, so surrounding whitespace alone is not a change. */
export const sameText = (a: string, b: string) => a === b || a.trim() === b.trim();
export type FieldConflict = { mine: string; theirs: string };
/**
 * base: what this page last knew as saved; local: the draft; remote: the newer server text.
 * Remote wins where the draft is untouched, the draft stays where the server is untouched;
 * where both changed differently the draft is kept and the field is reported as a conflict,
 * so old text is never sent over new without the student choosing.
 * `sent`: a save of ours still in flight. A remote equal to it is our own write, not another tab's.
 */
export function mergeCard(keys: readonly string[], base: Record<string, string>, local: Record<string, string>, remote: Record<string, string>, sent?: Record<string, string> | null) {
  const draft: Record<string, string> = { ...local }, conflicts: Record<string, FieldConflict> = {};
  for (const key of keys) {
    const b = base[key] ?? "", l = local[key] ?? "", r = remote[key] ?? "";
    if (sameText(l, r) || sameText(r, b) || (sent && key in sent && sameText(r, sent[key]))) continue;
    if (sameText(l, b)) { draft[key] = r; continue; }
    conflicts[key] = { mine: l, theirs: r };
  }
  return { draft, conflicts };
}
