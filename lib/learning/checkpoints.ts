import type { SessionState } from "../pipeline/types";
type CheckpointEvidence = { attemptId: string; status: string; completedAt: string | null; isBaseline: boolean };
/** Qualification and chronology come from immutable checkpoint completion records. */
export function checkpointScorePoints(sessions: SessionState[], checkpoints: CheckpointEvidence[]) {
  return checkpoints.filter(c => c.status === "eligible" && c.completedAt)
    .sort((a,b) => a.completedAt!.localeCompare(b.completedAt!) || a.attemptId.localeCompare(b.attemptId))
    .flatMap((checkpoint, index) => {
      const evaluation = sessions.find(s => s.id === checkpoint.attemptId)?.evaluation;
      return evaluation ? [{ date: checkpoint.completedAt!, label: checkpoint.isBaseline ? "基线" : `检查点 ${index + 1}`, overall: evaluation.scores.overall, dims: evaluation.scores.dims }] : [];
    });
}
