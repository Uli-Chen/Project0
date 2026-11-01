import type { AgentAction } from "./schemas";
import type { CoachMessage, Comparison, EssayKind, Evaluation, Focus, MemoryChange, Mode, Nudge, Outline, Prompt, Scores, SessionKind, Stage, Suggestion } from "@/lib/prototype/types";

export type SessionState = {
  id: string; kind: SessionKind; mode: Mode; prompt: Prompt; focus: Focus | null; stage: Stage;
  createdAt: string; updatedAt: string; version: number; completedRequests?: string[];
  lastWriteId?: string;
  pendingAction?: { requestId: string; input: AgentAction; startedAt: string; error?: string } | null;
  outline: Outline; prewriteTurns: number; messages: CoachMessage[]; suggestions: Record<string, Suggestion>;
  nudge: Nudge | null; nudgedParagraphs: Record<string, boolean>; nudgesEnabled: boolean;
  drafts: Record<EssayKind, string>; elapsed: Record<EssayKind, number>; savedAt: string | null;
  submitted: Record<EssayKind, string | null>; evalStep: "scoring" | "feedback" | null; evalError: string | null;
  evaluation: Evaluation | null; revisionScores: Scores | null; comparison: Comparison | null;
  issueLevels: Record<number, 1 | 2 | 3>; activeIssue: number;
  finish: { memoryChanges: MemoryChange[]; planChange: string } | null;
  rating: { useful: number | null; mine: "yes" | "partly" | "no" | null; comment: string } | null;
};
