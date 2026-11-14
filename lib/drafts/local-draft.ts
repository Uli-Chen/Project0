/**
 * Unsent text kept in this tab's sessionStorage, so leaving a practice page by any route
 * (including the browser's back button, which skips the page's own leave checks) and coming
 * back restores it. Storage can be unavailable (private mode, blocked site data): every access
 * is guarded and the page works without it.
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
/** A stored draft the server already has (the send went through before the student left) is not restored. */
export function restorableDraft(stored: string, sentTexts: readonly string[]): string {
  const text = stored.trim();
  return text && !sentTexts.some(sent => sent.trim() === text) ? stored : "";
}
export const coachDraftKey = (sessionId: string) => `p0:coach-draft:${sessionId}`;
export const quickDraftKey = (sessionId: string, box: "answer" | "ask") => `p0:quick-${box}:${sessionId}`;
