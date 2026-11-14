/**
 * Unsent text kept in this tab's sessionStorage, so leaving a practice page by any route
 * (including the browser's back button, which skips the page's own leave checks) and coming
 * back restores it. A box's stored text is always unsent: a box is emptied (and its storage
 * cleared) when its text is sent, and refilled only when the send failed. Storage can be
 * unavailable (private mode, blocked site data): every access is guarded and the page works
 * without it.
 */
export function readLocalDraft(key: string): string {
  try { return window.sessionStorage.getItem(key) ?? ""; } catch { return ""; }
}
export function writeLocalDraft(key: string, text: string) {
  try {
    if (text.trim()) window.sessionStorage.setItem(key, text);
    else window.sessionStorage.removeItem(key);
  } catch { /* storage unavailable: the in-page copy is all there is */ }
}
export const coachDraftKey = (sessionId: string) => `p0:coach-draft:${sessionId}`;
export const quickDraftKey = (sessionId: string, box: "answer" | "ask") => `p0:quick-${box}:${sessionId}`;
/** Essay fields that might not reach the server after the page was left: one record per page
 * instance, written before the leave-time save starts and removed (only that record) when it
 * succeeds. Offered back on a later visit, never applied by itself. */
export const essayLeftoverKey = (sessionId: string) => `p0:essay-leftover:${sessionId}`;
export const LEFTOVER_EVENT = "p0:essay-leftover";
export type EssayLeftover = { owner: string; at: number; drafts: { original: string; revision: string }; outline: unknown };
export function readLeftovers(sessionId: string): EssayLeftover[] {
  try {
    const list = JSON.parse(readLocalDraft(essayLeftoverKey(sessionId)) || "[]");
    return Array.isArray(list) ? list.filter((r): r is EssayLeftover => r && typeof r.owner === "string" && r.drafts && typeof r.drafts.original === "string" && typeof r.drafts.revision === "string") : [];
  } catch { return []; }
}
function writeLeftovers(sessionId: string, list: EssayLeftover[]) {
  writeLocalDraft(essayLeftoverKey(sessionId), list.length ? JSON.stringify(list) : "");
  try { window.dispatchEvent(new Event(LEFTOVER_EVENT)); } catch { /* no window */ }
}
export function putLeftover(sessionId: string, record: EssayLeftover) { writeLeftovers(sessionId, [...readLeftovers(sessionId).filter(r => r.owner !== record.owner), record]); }
/** Remove one instance's record, or every record when no owner is given. */
export function dropLeftover(sessionId: string, owner?: string) { writeLeftovers(sessionId, owner ? readLeftovers(sessionId).filter(r => r.owner !== owner) : []); }
/** Records whose content the server already holds need no offer. */
export function leftoversToOffer(list: readonly EssayLeftover[], server: { drafts: { original: string; revision: string }; outline: unknown }) {
  return list.filter(r => r.drafts.original !== server.drafts.original || r.drafts.revision !== server.drafts.revision || JSON.stringify(r.outline) !== JSON.stringify(server.outline));
}
/** Text that a request finishing after its page was left puts back. It never overwrites a box key
 * (a newer page may own it by then); it is collected here and merged into the box on the next visit. */
export const orphanKey = (boxKey: string) => `${boxKey}:orphan`;
export function addOrphan(boxKey: string, text: string) {
  const back = text.trim();
  if (!back) return;
  const existing = readLocalDraft(orphanKey(boxKey));
  writeLocalDraft(orphanKey(boxKey), !existing.trim() ? text : existing.includes(back) ? existing : `${existing}\n${text}`);
}
/** Read and clear the orphaned text for a box. */
export function takeOrphan(boxKey: string) {
  const text = readLocalDraft(orphanKey(boxKey));
  writeLocalDraft(orphanKey(boxKey), "");
  return text;
}
/** Put returned text in front of what the box already holds, without duplicating it. */
export function joinDraft(current: string, text: string) {
  const now = current.trim(), back = text.trim();
  if (!back || now === back || now.startsWith(`${back}\n`) || now.includes(back)) return current;
  return now ? `${back}\n${current}` : text;
}

/** A quick answer stays in its box while it is being sent, so it is stored with the question it
 * answers: on return it is dropped only if the server holds that very reply to that question. */
export type StoredAnswer = { text: string; questionId: string | null };
export function encodeAnswer(text: string, questionId: string | null) { return text.trim() ? JSON.stringify({ text, questionId }) : ""; }
export function decodeAnswer(raw: string): StoredAnswer | null {
  if (!raw.trim()) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredAnswer>;
    return typeof value.text === "string" && value.text.trim() ? { text: value.text, questionId: typeof value.questionId === "string" ? value.questionId : null } : null;
  } catch { return { text: raw, questionId: null }; }
}
export function answerToRestore(stored: StoredAnswer | null, messages: readonly { role: string; replyToMessageId?: string; content: string }[]): string {
  if (!stored) return "";
  const reply = stored.questionId ? messages.find(m => m.role === "user" && m.replyToMessageId === stored.questionId) : undefined;
  return reply && reply.content.trim() === stored.text.trim() ? "" : stored.text;
}
