export type CheckpointInput = {
  firstDeepCompletedAt: string | null; lastEligibleCompletedAt: string | null; deferredUntil?: string | null;
  activeAttemptId?: string; candidates: { id: string; pool: string; bankOrder: number; eligible: boolean; eligibleTypeCount: number }[];
};
/** A checkpoint can start any time a fresh question exists: no first essay is required and there is
 * no cooldown (owner decision, 2026-11-16). "Later" only quiets the invitation; the learner can still
 * start one, so a deferred state carries its candidate too. Candidate availability is provisional. */
export function checkpointState(input: CheckpointInput, now: string) {
  if (input.activeAttemptId) return { state: "in_progress" as const, attemptId: input.activeAttemptId };
  const candidate = input.candidates.filter(q => q.eligible).sort((a,b) => Number(b.pool === "checkpoint_reserved") - Number(a.pool === "checkpoint_reserved") || a.eligibleTypeCount - b.eligibleTypeCount || a.bankOrder - b.bankOrder)[0];
  if (!candidate) return { state: "unavailable" as const };
  if (input.deferredUntil && Date.parse(now) < Date.parse(input.deferredUntil)) return { state: "deferred" as const, candidateQuestionId: candidate.id };
  return { state: "available" as const, candidateQuestionId: candidate.id };
}
