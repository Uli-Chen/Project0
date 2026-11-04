import { runTutorAction } from "../tutor/runtime";
import { newTutorExecution, tutorActions } from "../tutor/execution";
import { callSites, type CallSite } from "../llm/call-sites";
import { modelMessages } from "../llm/projection";
import "server-only";
import { z } from "zod";
import { generateJson, type GenerateJsonOptions } from "@/lib/llm/client";
import { prompt } from "@/lib/llm/prompts";
import { checkInput, countWords, splitSentences } from "@/lib/rules";
import type { CoachMessage, EssayKind } from "@/lib/prototype/types";
import { coachSchema, comparisonSchema, evaluationSchema, finishSchema, prewriteSchema, type AgentAction } from "./schemas";
import { setSlot } from "./outline";
import type { SessionState } from "./types";
import type { PracticeCheckpoint } from "@/lib/db/practice-facts";
import type { UserProfile } from "@/lib/auth/types";

export class SessionError extends Error { constructor(message: string, public status = 400, public code?: string) { super(message); } }
function requireStage(state: SessionState, ...stages: SessionState["stage"][]) { if (!stages.includes(state.stage)) throw new SessionError("当前阶段不能执行这项操作，请刷新后重试。", 409); }
export function assertOriginalEvaluationStage(state: SessionState) { requireStage(state, "writing", "evaluating"); }
function addMessage(state: SessionState, message: Omit<CoachMessage, "id">) { state.messages.push({ id: crypto.randomUUID(), ...message }); }
function kindFor(state: SessionState): EssayKind { return state.stage === "revising" ? "revision" : "original"; }
function aiRatio(state: SessionState, essay: string) {
  const included = new Set(Object.values(state.suggestions).filter(s => s.status === "accepted" && essay.includes(s.suggestedText)).map(s => s.suggestedText));
  return Math.min(1, [...included].reduce((n, text) => n + countWords(text), 0) / Math.max(1, countWords(essay)));
}
function validSentences(ids: number[], text: string) { const valid = new Set(splitSentences(text).map(s => s.id)); return ids.filter(id => valid.has(id)); }

export type Checkpoint = (state: SessionState, event?: PracticeCheckpoint) => void;

export async function runAction(current: SessionState, input: AgentAction, checkpoint: Checkpoint, history: SessionState[] = [], profile?: UserProfile, ctx?: { userId: string; operationId: string; beforeTutorCommit?: () => void | Promise<void> }) {
  const state = structuredClone(current);
  let callId: string | undefined;
  const options = (site: CallSite): GenerateJsonOptions => ({ ...ctx, sessionId: state.id, purpose: callSites[site].purpose, callSite: site, stageGroup: callSites[site].group === "assist" && state.stage === "revising" ? "revise" : callSites[site].group, onSuccess: meta => { callId = meta.callId; } });
  const excluded = new Set(profile?.excludedMemoryIds ?? []);
  const learner = { target: profile?.target, difficulties: profile?.difficulties.filter(d => !excluded.has(`self:${d}`)), language: excluded.has("preference:lang") ? undefined : profile?.lang };
  const coached = <T extends object>(data: T) => ({ ...data, learner });
  const execution = state.pendingAction?.tutor ?? newTutorExecution(profile);
  if (execution.v2 && tutorActions.has(input.action)) return runTutorAction(state, input, profile, execution, options, ctx?.beforeTutorCommit);
  if (!execution.v2 && input.action === "prewrite" && input.intent) throw new SessionError("当前版本不支持给点提示。", 400);
  if (input.action === "startWriting") { requireStage(state, "prewriting"); state.stage = "writing"; return state; }
  if (input.action === "startRevision") { requireStage(state, "feedback"); if (input.openIssue !== undefined) { if (!state.evaluation?.issues.some(i => i.rank === input.openIssue)) throw new SessionError("问题不存在。", 404); state.activeIssue = input.openIssue; } state.stage = "revising"; state.drafts.revision = state.submitted.original ?? ""; return state; }
  if (input.action === "suggestion") {
    requireStage(state, "writing", "revising", ...(input.status === "dismissed" ? ["feedback"] as const : []));
    const suggestion = state.suggestions[input.id];
    if (!suggestion) throw new SessionError("建议不存在。", 404);
    suggestion.status = input.status; return state;
  }
  if (input.action === "dismissNudge") { if (state.nudge) state.nudge.dismissed = true; return state; }
  if (input.action === "rating") {
    requireStage(state, "compared", "finished");
    if (!input.useful && !input.mine) throw new SessionError("请至少选择一项评价。");
    state.rating = { useful: input.useful, mine: input.mine, comment: input.comment }; return state;
  }
  if (input.action === "retryReview") {
    requireStage(state, "feedback", "revising", "compared", "finished");
    if (!state.evaluation || !state.submitted.original) throw new SessionError("尚无可回顾的原稿。", 409);
    if (state.reviewStatus === "ok" || state.reviewStatus === "none") return state;
    await runOptionalReview(state, checkpoint, options("deep.review"));
    return state;
  }
  if (input.action === "evaluate") {
    const revision = input.kind === "revision";
    if (revision) requireStage(state, "revising", "re_evaluating");
    else assertOriginalEvaluationStage(state);
    const essay = state.submitted[input.kind] ?? state.drafts[input.kind];
    const rejection = checkInput(essay, state.prompt.text, input.kind, state.submitted.original ?? undefined);
    if (rejection) throw new SessionError(rejection);
    state.submitted[input.kind] = essay;
    state.stage = revision ? "re_evaluating" : "evaluating";
    state.evalStep = "scoring"; state.evalError = null; state.nudge = null;
    checkpoint(state, revision ? undefined : "acceptOriginal");
    const accepted = structuredClone(state);
    try {
      const result = await generateJson(
        prompt("judge/evaluate"),
        { task: state.prompt.text, essay, sentences: splitSentences(essay) }, evaluationSchema, options("deep.evaluate"));
      result.scores.overall = Math.round(Object.values(result.scores.dims).reduce((a, b) => a + b, 0) / 4 * 2) / 2;
      result.issues = result.issues.map((issue, index) => ({ ...issue, rank: index + 1, recurring: false, sentenceIds: validSentences(issue.sentenceIds, essay) }));
      result.review.aiRatio = state.mode === "mock" && !revision ? 0 : aiRatio(state, essay);
      if (!revision) {
        state.evaluation = result;
        state.stage = "feedback";
        state.evalStep = null;
        state.reviewStatus = state.outline.stance || state.outline.reasons.some(r => r.claim) || state.focus ? "pending" : "none";
        checkpoint(state, "completeOriginal");
      }
      else {
        state.revisionScores = result.scores; state.evalStep = "feedback"; checkpoint(state);
        const comparison = await generateJson(
          prompt("judge/compare"),
          { task: state.prompt.text, original: splitSentences(state.submitted.original ?? ""), revision: splitSentences(essay), originalIssues: state.evaluation?.issues ?? [] }, comparisonSchema, options("deep.compare"));
        const expectedRanks = state.evaluation?.issues.map(issue => issue.rank) ?? [];
        if (expectedRanks.some(rank => !comparison.issues.some(issue => issue.rank === rank))) throw new SessionError("对比结果不完整，请重试。", 502);
        comparison.issues = expectedRanks.map(rank => { const issue = comparison.issues.find(item => item.rank === rank)!; return { ...issue, revisionSentenceIds: validSentences(issue.revisionSentenceIds, essay) }; });
        comparison.idea.deepened = comparison.idea.deepened.map(item => ({ ...item, originalIds: validSentences(item.originalIds, state.submitted.original ?? ""), revisionIds: validSentences(item.revisionIds, essay) }));
        comparison.aiRatio = aiRatio(state, essay); state.comparison = comparison; state.stage = "compared";
      }
      state.evalStep = null;
    } catch (error) {
      // A failed feedback transaction must not leak its unsaved evaluation via
      // the error checkpoint. Preserve the accepted original for safe retry.
      if (!revision) Object.assign(state, accepted);
      state.evalError = error instanceof Error ? error.message : "评估未完成，请重试。";
      checkpoint(state);
      throw error;
    }
    // Required feedback is already committed. Optional failure never reaches
    // the core-evaluation catch or rolls back its stage/completion.
    if (!revision && state.reviewStatus === "pending") await runOptionalReview(state, checkpoint, options("deep.review"));
    return state;
  }
  if (input.action === "finish") {
    requireStage(state, "feedback", "compared", "finished");
    if (state.finish) return state;
    state.finish = await generateJson(
      prompt("judge/finish"),
      coached({ task: state.prompt.text, evaluation: state.evaluation, comparison: state.comparison, original: state.submitted.original, revision: state.submitted.revision, prior: history.filter(s => s.id !== state.id).slice(0, 5).map(s => ({ issues: s.evaluation?.issues.filter(i => !excluded.has(`issue:${i.code || i.title}`)) })) }), finishSchema, options("deep.finish"));
    state.stage = "finished"; return state;
  }
  if (input.action === "prewrite") {
    requireStage(state, "prewriting");
    if (state.prewriteTurns >= 40) throw new SessionError("本次写前讨论已足够充分，请编辑提纲后开始写作。");
    const result = await generateJson(
      prompt("coach/prewrite"),
      coached({ task: state.prompt.text, outline: state.outline, conversation: modelMessages(state.messages.slice(-20)), student: input.text }), prewriteSchema, options("deep.prewrite"));
    for (const update of result.updates) {
      if (input.text.includes(update.source) || state.messages.some(m => m.role === "user" && m.content.includes(update.source))) state.outline = setSlot(state.outline, update.path, update.text, update.source);
    }
    state.prewriteTurns++;
    addMessage(state, { role: "user", stage: "prewriting", content: input.text });
    addMessage(state, { role: "coach", callId, stage: "prewriting", content: result.reply });
    return state;
  }
  if (input.action === "nudge") {
    requireStage(state, "writing", "revising");
    const key = `${input.kind}:${input.paragraphIndex}`;
    if (!state.nudgesEnabled || state.nudgedParagraphs[key] || (state.mode === "mock" && state.stage === "writing")) return state;
    if (input.kind !== kindFor(state)) throw new SessionError("段落不属于当前稿件。");
    const paragraph = state.drafts[input.kind].split(/\n+/).map(p => p.trim()).filter(Boolean)[input.paragraphIndex];
    if (!paragraph || countWords(paragraph) < 30) return state;
    const result = await generateJson(prompt("coach/nudge"), { task: state.prompt.text, essay: state.drafts[input.kind], paragraph }, z.object({ message: z.string().max(500).nullable(), code: z.string().max(30) }), options("deep.nudge"));
    state.nudgedParagraphs[key] = true;
    if (result.message) state.nudge = { paragraphIndex: input.paragraphIndex, code: result.code, message: result.message, dismissed: false };
    return state;
  }
  requireStage(state, "writing", "revising", ...(input.action === "issue" ? ["feedback"] as const : []));
  if (state.mode === "mock" && state.stage === "writing") throw new SessionError("模考写作阶段不提供教练协助。");
  if (state.messages.length >= 200) throw new SessionError("本次对话已达到上限，请完成当前稿件。");
  const essay = state.drafts[kindFor(state)];
  const stage = state.stage === "revising" ? "revision" as const : "writing" as const;
  if (input.action === "issue") {
    const issue = state.evaluation?.issues.find(i => i.rank === input.rank);
    if (!issue) throw new SessionError("问题不存在。", 404);
    if (input.intent !== "more" && !input.text?.trim()) throw new SessionError("请先输入你想问的问题或改写句子。");
    const level = Math.min(3, (state.issueLevels[input.rank] ?? 1) + (input.intent === "more" ? 1 : 0)) as 1 | 2 | 3;
    const result = await generateJson(prompt("coach/issue"), { task: state.prompt.text, issue, level, intent: input.intent, student: input.text, original: state.submitted.original, draft: essay, conversation: modelMessages(state.messages.filter(m => m.issueRank === input.rank).slice(-8)) }, coachSchema, options("deep.issue"));
    state.issueLevels[input.rank] = level;
    addMessage(state, { role: "user", stage: "issue", issueRank: input.rank, action: input.intent === "more" ? "hint" : input.intent, content: input.text ?? "再给点提示" });
    addMessage(state, { role: "coach", callId, stage: "issue", issueRank: input.rank, level, content: result.reply });
    return state;
  }
  const selection = "selection" in input ? input.selection : "quote" in input ? input.quote : undefined;
  if (selection && !essay.includes(selection)) throw new SessionError("选中的原文已经变化，请重新选择。");
  const instruction = {
    clarify: prompt("coach/clarify"),
    polish: prompt("coach/polish"),
    check: prompt("coach/check"),
    express: prompt("coach/express"),
    chat: prompt("coach/chat"),
  }[input.action];
  const result = await generateJson(instruction, coached({ task: state.prompt.text, outline: state.outline, essay, selection, student: "text" in input ? input.text : undefined, conversation: modelMessages(state.messages.filter(m => m.stage === stage).slice(-14)) }), coachSchema, options(`deep.${input.action}`));
  const ids: string[] = [];
  for (const suggestion of result.suggestions) {
    if (!["polish", "check", "express"].includes(input.action)) continue;
    if (suggestion.type !== input.action) continue;
    if (input.action !== "express" && suggestion.selectionText !== selection) continue;
    const id = crypto.randomUUID(); ids.push(id);
    state.suggestions[id] = { ...suggestion, id, selectionText: input.action === "express" ? "" : suggestion.selectionText, status: "pending" };
  }
  const labels = { clarify: "理清这段", polish: "润色这句", check: "检查这段" };
  addMessage(state, { role: "user", stage, action: input.action, content: "text" in input ? input.text : labels[input.action], quote: selection });
  addMessage(state, { role: "coach", callId, stage, action: input.action, content: result.reply, suggestionIds: ids });
  return state;
}

/** The same review prompt and inputs as before; only the save boundary changed. */
async function runOptionalReview(state: SessionState, checkpoint: Checkpoint, options: GenerateJsonOptions) {
  state.reviewStatus = "pending";
  checkpoint(state);
  let review;
  try {
    review = await generateJson(prompt("judge/review"), { task: state.prompt.text, essay: state.submitted.original, outline: state.outline, focus: state.focus }, evaluationSchema.shape.review, options);
  } catch {
    state.reviewStatus = "failed";
    checkpoint(state);
    return;
  }
  review.aiRatio = state.mode === "mock" ? 0 : aiRatio(state, state.submitted.original!);
  state.evaluation!.review = review;
  state.reviewStatus = "ok";
  checkpoint(state);
}
