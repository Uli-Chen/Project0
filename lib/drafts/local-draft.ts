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
/** Essay fields that had not reached the server when the page was left. */
export const essayUnsavedKey = (sessionId: string) => `p0:essay-unsaved:${sessionId}`;

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
