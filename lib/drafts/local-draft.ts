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
const isRecord = (r: unknown): r is EssayLeftover => {
  const v = r as EssayLeftover | null;
  return !!v && typeof v.owner === "string" && !!v.drafts && typeof v.drafts.original === "string" && typeof v.drafts.revision === "string";
};
export function readLeftovers(sessionId: string): EssayLeftover[] {
  try {
    const parsed: unknown = JSON.parse(readLocalDraft(essayLeftoverKey(sessionId)) || "[]");
    if (Array.isArray(parsed)) return parsed.filter(isRecord);
    // An earlier build stored one bare { drafts, outline } object: keep it as a record.
    const legacy = parsed as { drafts?: { original?: unknown; revision?: unknown }; outline?: unknown };
    if (legacy && typeof legacy.drafts?.original === "string") return [{ owner: "legacy", at: 0, drafts: { original: legacy.drafts.original, revision: typeof legacy.drafts.revision === "string" ? legacy.drafts.revision : "" }, outline: legacy.outline }];
    return [];
  } catch { return []; }
}
function writeLeftovers(sessionId: string, list: EssayLeftover[]) {
  writeLocalDraft(essayLeftoverKey(sessionId), list.length ? JSON.stringify(list) : "");
  try { window.dispatchEvent(new CustomEvent(LEFTOVER_EVENT, { detail: sessionId })); } catch { /* no window */ }
}
export function putLeftover(sessionId: string, record: EssayLeftover) { writeLeftovers(sessionId, [...readLeftovers(sessionId).filter(r => r.owner !== record.owner), record]); }
/** Remove the records with these owners (one page instance each). */
export function dropLeftover(sessionId: string, ...owners: string[]) { writeLeftovers(sessionId, readLeftovers(sessionId).filter(r => !owners.includes(r.owner))); }
/** Records whose content the server already holds need no offer. */
export type EssaySnapshot = { stage: string; drafts: { original: string; revision: string }; outline: unknown };
export function leftoversToOffer(list: readonly EssayLeftover[], server: EssaySnapshot) {
  return list.filter(r => differingFields(r, server).length > 0);
}
type Field = "original" | "revision" | "outline";
export function differingFields(record: EssayLeftover, server: EssaySnapshot): Field[] {
  const fields: Field[] = [];
  if (record.drafts.original !== server.drafts.original) fields.push("original");
  if (record.drafts.revision !== server.drafts.revision) fields.push("revision");
  if (record.outline !== undefined && JSON.stringify(record.outline) !== JSON.stringify(server.outline)) fields.push("outline");
  return fields;
}
/** What the server saves in each stage (see PATCH /api/sessions/[id]). */
export function editableFields(stage: string): Field[] {
  if (stage === "prewriting" || stage === "writing") return ["original", "outline"];
  if (stage === "revising") return ["revision", "outline"];
  return [];
}
/** Quick: a "放弃并离开" in this tab marks the time; text a late request from an older page puts back is then ignored. */
export const quickDiscardKey = (sessionId: string) => `p0:quick-discarded:${sessionId}`;
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
