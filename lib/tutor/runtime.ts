import "server-only";
import { z } from "zod";
import { generateJson, type GenerateJsonOptions } from "../llm/client";
import { prompt } from "../llm/prompts";
import { modelMessages } from "../llm/projection";
import type { CallSite } from "../llm/call-sites";
import { coachSchema, type AgentAction } from "../pipeline/schemas";
import type { SessionState } from "../pipeline/types";
import type { UserProfile } from "../auth/types";
import { setSlot } from "../pipeline/outline";
import { countWords } from "../rules";
import { SessionError } from "../pipeline/engine";
import { readTutorState, tutorOutputSchema } from "./schemas";
import { openThread, fromLegacy, reconcileLegacy, reopenThread, escalate, applyDelta, syncIssueLevels, threadView } from "./thread";
import type { RefKeys, HelpEvent, TutorOutput, TutorState } from "./types";
import type { TutorExecution } from "./execution";

export function tutorWarnings(reply: string, entry: string, studentTexts: string[]) {
  const warnings: Record<string, number> = {};
  if (entry === "prewrite" && (reply.match(/[?？]/g)?.length ?? 0) > 1) warnings.multiple_questions = 1;
  const sentences = reply.match(/[A-Za-z][A-Za-z\s,'’"():;-]*[.!?]/g) ?? [];
  const copied = sentences.filter(s => (s.match(/[A-Za-z]+/g)?.length ?? 0) > 8 && !studentTexts.some(t => t.includes(s.trim())));
  if (copied.length) warnings.unattributed_sentence = copied.length;
  return warnings;
}
function emptyTutor(): TutorState { return { v: 1, brief: null, activeThread: null, threads: {}, helpEvents: [] }; }
export async function runTutorAction(state: SessionState, input: AgentAction, profile: UserProfile | undefined, execution: TutorExecution, options: (site: CallSite) => GenerateJsonOptions, beforeCommit?: () => void | Promise<void>) {
  const entry = input.action as HelpEvent["entry"];
  const writing: "original" | "revision" = state.stage === "revising" ? "revision" : "original";
  const messageStage = writing === "revision" ? "revision" : "writing";
  if (input.action === "prewrite") {
    if (state.stage !== "prewriting") throw new SessionError("当前阶段不能执行这项操作，请刷新后重试。", 409);
    if (state.prewriteTurns >= 40) throw new SessionError("本次写前讨论已足够充分，请编辑提纲后开始写作。");
  } else {
    if (!["writing", "revising", ...(input.action === "issue" ? ["feedback"] : [])].includes(state.stage)) throw new SessionError("当前阶段不能执行这项操作，请刷新后重试。", 409);
    if (state.mode === "mock" && state.stage === "writing") throw new SessionError("模考写作阶段不提供教练协助。");
    if (state.messages.length >= 200 && input.action !== "nudge") throw new SessionError("本次对话已达到上限，请完成当前稿件。");
  }
  let tutor: TutorState;
  try { tutor = readTutorState(state.tutor) ?? emptyTutor(); } catch { console.error("Invalid tutor state; preserved"); throw new SessionError("这个练习的教学状态需要新版本，请刷新页面。", 409, "tutor_stale"); }
  const excluded = new Set(profile?.excludedMemoryIds ?? []);
  const learner = { target: profile?.target, difficulties: profile?.difficulties.filter(d => !excluded.has(`self:${d}`)), explainLanguage: execution.explainLanguage };
  const allStudent = state.messages.filter(m => m.role === "user" && m.action !== "hint").map(m => m.content);
  const student = "text" in input ? input.text ?? "" : "";
  if (student && !(input.action === "prewrite" && input.intent === "more")) allStudent.push(student);
  const studentTexts = [...allStudent, state.drafts.original, state.drafts.revision];
  let callId: string | undefined;
  const base = options(`deep.${entry}` as CallSite);
  const callOptions: GenerateJsonOptions = { ...base, coachV2: true, onSuccess: meta => { callId = meta.callId; base.onSuccess?.(meta); } };
  const userId = crypto.randomUUID(), coachId = crypto.randomUUID();
  const event = (level: HelpEvent["level"], track: HelpEvent["track"], suggestionIds: string[], messageId: string | null) => {
    const helpEvent: HelpEvent = { id: crypto.randomUUID(), at: new Date().toISOString(), entry, essayKind: input.action === "prewrite" ? null : writing, draftVersion: state.version, level, track, suggestionIds, messageId };
    tutor.helpEvents = [...tutor.helpEvents, helpEvent].slice(-200);
    state.tutor = tutor;
  };
  if (input.action === "prewrite" || input.action === "issue") {
    const isPrewrite = input.action === "prewrite";
    const issue = input.action === "issue" ? state.evaluation?.issues.find(i => i.rank === input.rank) : undefined;
    if (!isPrewrite && !issue) throw new SessionError("问题不存在。", 404);
    if (input.action === "issue" && input.intent !== "more" && !student.trim()) throw new SessionError("请先输入你想问的问题或改写句子。");
    const key = isPrewrite ? "prewrite" : `issue:${issue!.rank}`;
    const history = isPrewrite ? state.messages.slice(-20) : state.messages.filter(m => m.issueRank === issue!.rank).slice(-8);
    const latest = history.at(-1)?.id ?? null;
    const existing = tutor.threads[key];
    let thread = existing ? reconcileLegacy(existing, latest, issue ? state.issueLevels[issue.rank] ?? 1 : undefined) : isPrewrite ? openThread(key, "argument") : fromLegacy(key, "argument", state.issueLevels[issue!.rank] ?? 1, issue!.title, issue!.sentenceIds.map(String));
    if (thread.status === "closed") thread = reopenThread(thread);
    if (input.intent === "more") thread = escalate(thread);
    const refs: RefKeys = Object.fromEntries(history.filter(m => m.role === "user" && m.action !== "hint").map(m => [`m:${m.id}`, { messageId: m.id, text: m.content }]));
    if (student && input.intent !== "more") refs.cur = { messageId: userId, text: student };
    const schema = tutorOutputSchema({ thread, refKeys: refs, allowOutline: isPrewrite, newThread: !existing });
    let outlineWarnings: Record<string, number> = {};
    callOptions.resultMetadata = raw => {
      const out = raw as TutorOutput;
      outlineWarnings = {};
      for (const update of out.payload.outlineUpdates ?? []) {
        if (!allStudent.some(text => text.includes(update.source))) outlineWarnings.outline_source_dropped = (outlineWarnings.outline_source_dropped ?? 0) + 1;
        else if (!allStudent.some(text => text.includes(update.text))) outlineWarnings.outline_text_replaced = (outlineWarnings.outline_text_replaced ?? 0) + 1;
      }
      return { move: out.move, allowedHelp: thread.allowedHelp, providedHelp: out.help.level, warnings: { ...tutorWarnings(out.reply, entry, studentTexts), ...outlineWarnings } };
    };
    const result = await generateJson(prompt(isPrewrite ? "coach-v2/prewrite" : "coach-v2/issue"), {
      task: state.prompt.text, intent: input.intent ?? "answer", learner, outline: state.outline, ...(issue ? { issue, original: state.submitted.original, draft: state.drafts[writing] } : {}),
      conversation: modelMessages(history), student: refs.cur ? student : undefined, newThread: !existing,
      thread: { ...threadView(thread), track: !isPrewrite && !existing ? undefined : thread.track }, refs,
    }, schema, callOptions);
    await beforeCommit?.();
    const next = applyDelta(thread, result, { refs, coachMessageId: coachId, newId: () => crypto.randomUUID() });
    tutor.threads[key] = next; tutor.activeThread = key;
    const ids: string[] = [];
    if (result.payload.suggestion) { const id = crypto.randomUUID(); ids.push(id); state.suggestions[id] = { ...result.payload.suggestion, id, type: "example", selectionText: "", status: "pending" }; }
    if (isPrewrite) {
      for (const update of result.payload.outlineUpdates ?? []) {
        if (!allStudent.some(text => text.includes(update.source))) continue;
        state.outline = setSlot(state.outline, update.path, allStudent.some(text => text.includes(update.text)) ? update.text : update.source, update.source);
      }
      state.prewriteTurns++;
    } else state.issueLevels = syncIssueLevels(state.issueLevels, next);
    state.messages.push({ id: userId, role: "user", stage: isPrewrite ? "prewriting" : "issue", ...(issue ? { issueRank: issue.rank } : {}), ...(input.intent === "more" ? { action: "hint" as const } : input.action === "issue" ? { action: input.intent } : {}), content: input.intent === "more" ? "（请求提示）" : student });
    state.messages.push({ id: coachId, role: "coach", stage: isPrewrite ? "prewriting" : "issue", ...(issue ? { issueRank: issue.rank, level: next.allowedHelp as 1 | 2 | 3 } : {}), content: result.reply, suggestionIds: ids, callId, lang: execution.explainLanguage });
    event(result.help.level, next.track, ids, coachId);
    return state;
  }
  if (input.action === "nudge") {
    const key = `${input.kind}:${input.paragraphIndex}`;
    if (!state.nudgesEnabled || state.nudgedParagraphs[key]) return state;
    if (input.kind !== writing) throw new SessionError("段落不属于当前稿件。", 409);
    const paragraph = state.drafts[input.kind].split(/\n+/).map(p => p.trim()).filter(Boolean)[input.paragraphIndex];
    if (!paragraph || countWords(paragraph) < 30) return state;
    callOptions.resultMetadata = raw => ({ warnings: tutorWarnings((raw as {message: string | null}).message ?? "", entry, studentTexts) });
    const result = await generateJson(prompt("coach-v2/nudge"), { task: state.prompt.text, essay: state.drafts[input.kind], paragraph, learner }, z.object({ message: z.string().max(500).nullable(), code: z.string().max(30) }), callOptions);
    await beforeCommit?.(); state.nudgedParagraphs[key] = true;
    if (result.message) { state.nudge = { paragraphIndex: input.paragraphIndex, code: result.code, message: result.message, dismissed: false }; event(null, null, [], null); }
    return state;
  }
  if (!["chat", "clarify", "polish", "express", "check"].includes(input.action)) throw new SessionError("不支持的教练动作。", 400);
  const selection = "selection" in input ? input.selection : "quote" in input ? input.quote : undefined;
  if (selection && !state.drafts[writing].includes(selection)) throw new SessionError("选中的原文已经变化，请重新选择。");
  const names = { chat: "coach-v2/chat", clarify: "coach-v2/clarify", polish: "coach-v2/polish", express: "coach-v2/express", check: "coach-v2/check" } as const;
  callOptions.resultMetadata = raw => ({ warnings: tutorWarnings((raw as {reply:string}).reply, entry, studentTexts) });
  const result = await generateJson(prompt(names[input.action as keyof typeof names]), { task: state.prompt.text, outline: state.outline, essay: state.drafts[writing], selection, student: "text" in input ? input.text : undefined, conversation: modelMessages(state.messages.filter(m => m.stage === messageStage).slice(-14)), learner }, coachSchema, callOptions);
  await beforeCommit?.();
  const ids: string[] = [];
  for (const suggestion of result.suggestions) {
    if (!["polish", "express", "check"].includes(input.action) || suggestion.type !== input.action || (input.action !== "express" && suggestion.selectionText !== selection)) continue;
    const id = crypto.randomUUID(); ids.push(id); state.suggestions[id] = { ...suggestion, id, selectionText: input.action === "express" ? "" : suggestion.selectionText, status: "pending" };
  }
  const labels: Record<string,string> = { clarify: "理清这段", polish: "润色这句", check: "检查这段" };
  state.messages.push({ id: userId, role: "user", stage: messageStage, action: input.action as "chat", content: student || labels[input.action], quote: selection });
  state.messages.push({ id: coachId, role: "coach", stage: messageStage, action: input.action as "chat", content: result.reply, suggestionIds: ids, callId, lang: execution.explainLanguage });
  event(null, null, ids, coachId); return state;
}
