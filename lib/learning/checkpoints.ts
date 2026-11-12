import type { SessionState } from "../pipeline/types";
type CheckpointEvidence = { attemptId: string; status: string; completedAt: string | null; isBaseline: boolean };
/** Qualification and chronology come from immutable checkpoint completion records. */
export function checkpointScorePoints(sessions: SessionState[], checkpoints: CheckpointEvidence[]) {
  return checkpoints.filter(c => c.status === "eligible" && c.completedAt)
    .sort((a,b) => a.completedAt!.localeCompare(b.completedAt!) || a.attemptId.localeCompare(b.attemptId))
    .flatMap(checkpoint => {
      const evaluation = sessions.find(s => s.id === checkpoint.attemptId)?.evaluation;
      return evaluation ? [{ date: checkpoint.completedAt!, overall: evaluation.scores.overall, dims: evaluation.scores.dims }] : [];
    })
    // Learners see "the Nth independent mock" on the chart, never baseline/checkpoint terms.
    .map((point, index) => ({ ...point, label: `第 ${index + 1} 次` }));
}
