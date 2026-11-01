import { prewriteOpening } from "../learning/prewrite-guidance";
import type { SessionState } from "./types";
import type { Mode, Prompt, SessionKind } from "@/lib/prototype/types";
const questions: Prompt[] = [
  { id: "education", text: "Some people believe that university education should be free for all students. To what extent do you agree or disagree?", topicTags: ["education"], questionType: "agree_disagree" },
  { id: "technology", text: "Many people now work from home using modern technology. Do the advantages of this trend outweigh the disadvantages?", topicTags: ["technology", "work"], questionType: "adv_disadv" },
  { id: "society", text: "In many countries, more and more young people are leaving their hometowns to live in big cities. Why is this happening? Is it a positive or negative development?", topicTags: ["society"], questionType: "two_part" },
];
function questionType(text: string): Prompt["questionType"] {
  if (/discuss.*both|both.*views/i.test(text)) return "discuss_both";
  if (/advantages.*disadvantages|benefits.*drawbacks/i.test(text)) return "adv_disadv";
  if (/(problems?|causes?)/i.test(text) && /(solutions?|measures|solved?|address)/i.test(text)) return "problem_solution";
  if (/positive or negative|why.*happen/i.test(text) || (text.match(/\?/g)?.length ?? 0) > 1) return "two_part";
  return "agree_disagree";
}
export function createSession(input: { kind: SessionKind; mode: Mode; prompt?: string }): SessionState {
  const mode = input.kind === "assessment" ? "mock" : input.mode;
  const now = new Date().toISOString();
  const prompt: Prompt = input.prompt ? { id: crypto.randomUUID(), text: input.prompt, topicTags: [], questionType: questionType(input.prompt) } : questions[input.kind === "assessment" ? 2 : Math.floor(Math.random() * questions.length)];
  return { schemaVersion: 2, activity: "deep", question: null, lifecycle: "open", lastStudentActionAt: null,
    continuedFromQuickId: null, cardSnapshot: null, rewriteOfDeepId: null, originalSubmittedAt: null,
    completedAt: null, originalFreshness: null, reviewStatus: "none", feedbackUpdatedAt: null, checkpointId: null,
    id: crypto.randomUUID(), kind: input.kind, mode, prompt, focus: null, stage: mode === "practice" ? "prewriting" : "writing", createdAt: now, updatedAt: now, version: 0,
    outline: { stance: null, reasons: [{ claim: null, why: null, example: null }, { claim: null, why: null, example: null }], counter: { view: null, response: null }, userEdited: false }, prewriteTurns: 0,
    messages: mode === "practice" ? [{ id: crypto.randomUUID(), role: "coach", stage: "prewriting", action: "opening", content: prewriteOpening(prompt.questionType) }] : [], suggestions: {}, nudge: null, nudgedParagraphs: {}, nudgesEnabled: true,
    drafts: { original: "", revision: "" }, elapsed: { original: 0, revision: 0 }, savedAt: now, submitted: { original: null, revision: null }, evalStep: null, evalError: null, evaluation: null, revisionScores: null, comparison: null, issueLevels: {}, activeIssue: 1, finish: null, rating: null };
}
