export type CheckpointInput = {
  firstDeepCompletedAt: string | null; lastEligibleCompletedAt: string | null; deferredUntil?: string | null;
  activeAttemptId?: string; candidates: { id: string; pool: string; bankOrder: number; eligible: boolean; eligibleTypeCount: number }[];
};
/** RFC §7: failures never move the due clock; candidate availability is provisional. */
export function checkpointState(input: CheckpointInput, now: string) {
  if (input.activeAttemptId) return { state: "in_progress" as const, attemptId: input.activeAttemptId };
  if (!input.firstDeepCompletedAt || (input.lastEligibleCompletedAt && Date.parse(now) < Date.parse(input.lastEligibleCompletedAt) + 14 * 86400000)) return { state: "not_due" as const };
  if (input.deferredUntil && Date.parse(now) < Date.parse(input.deferredUntil)) return { state: "deferred" as const };
  const candidate = input.candidates.filter(q => q.eligible).sort((a,b) => Number(b.pool === "checkpoint_reserved") - Number(a.pool === "checkpoint_reserved") || a.eligibleTypeCount - b.eligibleTypeCount || a.bankOrder - b.bankOrder)[0];
  return candidate ? { state: "available" as const, candidateQuestionId: candidate.id } : { state: "unavailable" as const };
}
