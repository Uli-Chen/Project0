import type { SessionState } from "../pipeline/types";

export type FixedIssue = { sessionId: string; rank: number; title: string; at: string };

/** Problems the learner has fixed: an issue from the original report that the comparison after a
 * full revision judged resolved. Newest first. */
export function fixedIssues(sessions: SessionState[]): FixedIssue[] {
  return sessions.flatMap((session) => {
    const issues = session.evaluation?.issues ?? [];
    return (session.comparison?.issues ?? []).flatMap((result) => {
      const issue = issues.find((item) => item.rank === result.rank);
      return result.status === "resolved" && issue ? [{ sessionId: session.id, rank: result.rank, title: issue.title, at: session.completedAt ?? session.updatedAt }] : [];
    });
  }).sort((a, b) => b.at.localeCompare(a.at) || a.rank - b.rank);
}
