import type { Help, TeachingState, Track, TutorOutput, RefKeys } from "./types";
export function openThread(key: string, track: Track, allowedHelp: Help = key === "prewrite" ? 0 : 1, target = "围绕题目整理学生自己的回答", refs: string[] = []): TeachingState {
  return { v: 1, key, status: "open", closedReason: null, track, current: { target, refs }, openQuestion: null, established: [], attempts: [], allowedHelp, providedHelp: null, legacyLevel: null, lastMessageId: null };
}
export function reopenThread(thread: TeachingState): TeachingState { return { ...structuredClone(thread), status: "open", closedReason: null }; }
export function escalate(thread: TeachingState): TeachingState { return { ...structuredClone(thread), allowedHelp: Math.min(thread.key === "prewrite" ? 2 : 3, thread.allowedHelp + 1) as Help }; }
export function fromLegacy(key: string, track: Track, level: 1 | 2 | 3 = 1, target?: string, refs?: string[]): TeachingState { return { ...openThread(key, track, level, target, refs), legacyLevel: level }; }
export function reconcileLegacy(thread: TeachingState, latestMessageId: string | null, legacyLevel?: 1 | 2 | 3): TeachingState {
  if (latestMessageId === thread.lastMessageId) return structuredClone(thread);
  return { ...reopenThread(thread), openQuestion: null, providedHelp: null, lastMessageId: latestMessageId, ...(thread.key !== "prewrite" && legacyLevel ? { allowedHelp: legacyLevel, legacyLevel } : {}) };
}
export function syncIssueLevels(levels: Record<number, number>, thread: TeachingState): Record<number, 1 | 2 | 3> {
  const next = { ...levels } as Record<number, 1 | 2 | 3>; if (thread.key.startsWith("issue:")) next[Number(thread.key.slice(6))] = Math.max(1, thread.allowedHelp) as 1 | 2 | 3; return next;
}
export function threadView(thread: TeachingState) { return { key: thread.key, status: thread.status, track: thread.track, current: thread.current, openQuestion: thread.openQuestion, established: thread.established.filter(e => !e.archived && !e.retracted), attempts: thread.attempts, allowedHelp: thread.allowedHelp, providedHelp: thread.providedHelp }; }
export function applyDelta(thread: TeachingState, output: TutorOutput, ctx: { refs: RefKeys; coachMessageId: string; newId?: () => string }): TeachingState {
  const next = structuredClone(thread); let serial = 0;
  for (const op of output.delta) {
    if (op.op === "establish") {
      const ref = ctx.refs[op.ref]; if (!ref || !op.text || !ref.text.includes(op.text)) throw new Error("确认项必须引用学生原话");
      next.established.push({ id: ctx.newId?.() ?? `${ctx.coachMessageId}:e${serial++}`, text: op.text, refMessageId: ref.messageId, basis: "student_stated", archived: false, retracted: false });
      while (next.established.filter(e => !e.archived && !e.retracted).length > 8) next.established.find(e => !e.archived && !e.retracted)!.archived = true;
    } else if (op.op === "retract") {
      const item = next.established.find(e => e.id === op.establishedId && !e.retracted); if (!ctx.refs[op.ref] || !item) throw new Error("撤回项或引用不存在"); item.retracted = true;
    } else if (op.op === "ask") next.openQuestion = { text: op.text, askedMessageId: ctx.coachMessageId };
    else if (op.op === "clearQuestion") next.openQuestion = null;
    else if (op.op === "recordAttempt") {
      const ref = ctx.refs[op.ref]; if (!ref || next.attempts.some(a => a.messageId === ref.messageId)) throw new Error("尝试引用无效或重复");
      next.attempts = [...next.attempts, { messageId: ref.messageId, result: op.result, reason: op.reason, help: output.help.level }].slice(-3);
    } else { next.status = "closed"; next.closedReason = "met"; }
  }
  next.track = output.track ?? next.track; next.providedHelp = Math.max(next.providedHelp ?? 0, output.help.level) as Help; next.lastMessageId = ctx.coachMessageId; return next;
}
