import { z } from "zod";
import { slotPathSchema } from "../pipeline/schemas";
import { applyDelta } from "./thread";
import type { Move, RefKeys, TeachingState, TutorOutput, TutorState } from "./types";
const help = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const text = z.string().min(1);
const track = z.enum(["argument", "language"]);
const result = z.enum(["met", "partial", "not_met", "unclear"]);
export const prewriteMoves: Move[] = ["ask", "clarify", "explain", "hint", "confirm", "invite_write"];
export const issueMoves: Move[] = ["ask", "clarify", "explain", "hint", "check_attempt", "confirm", "suggest"];
export function tutorOutputSchema(ctx: { thread: TeachingState; allowedMoves?: Move[]; refKeys: RefKeys; allowOutline: boolean; newThread: boolean }): z.ZodType<TutorOutput> {
  const writing = ctx.thread.key === "prewrite";
  const canCheck = !writing && Object.hasOwn(ctx.refKeys, "cur");
  const canSuggest = !writing && ctx.thread.allowedHelp === 3;
  const moves = (ctx.allowedMoves ?? (writing ? prewriteMoves : issueMoves)).filter(move => (move !== "suggest" || canSuggest) && (move !== "check_attempt" || canCheck));
  const refKeys = Object.keys(ctx.refKeys);
  const establishedIds = ctx.thread.established.filter(item => !item.retracted).map(item => item.id);
  // superRefine is not represented by z.toJSONSchema. Publish permissions in
  // the shape itself, and describe cross-field rules alongside their fields.
  const delta = z.discriminatedUnion("op", [
    z.object({ op: z.literal("ask"), text: text.max(2000) }).strict(),
    z.object({ op: z.literal("clearQuestion") }).strict(),
    ...(refKeys.length ? [z.object({ op: z.literal("establish"), text: text.max(200).describe("A contiguous verbatim quotation from the referenced student message."), ref: z.enum(refKeys) }).strict()] : []),
    ...(refKeys.length && establishedIds.length ? [z.object({ op: z.literal("retract"), establishedId: z.enum(establishedIds), ref: z.enum(refKeys) }).strict()] : []),
    ...(canCheck ? [
      z.object({ op: z.literal("recordAttempt"), ref: z.literal("cur"), result, reason: text.max(300) }).strict(),
      z.object({ op: z.literal("close"), reason: z.literal("met") }).strict(),
    ] : []),
  ]);
  const payloadShape = z.object({
    outlineUpdates: z.array(z.object({ path: slotPathSchema, text: text.max(2000), source: text.max(2000) }).strict()).max(9).optional(),
    suggestion: z.object({ suggestedText: text.max(2000), reason: text.max(2000) }).strict().optional().describe("Required exactly when move is suggest; otherwise omit. suggestedText contains exactly one sentence."),
  }).strict();
  const outlinePayload = ctx.allowOutline ? payloadShape : payloadShape.omit({ outlineUpdates: true });
  const payload: z.ZodType<TutorOutput["payload"]> = canSuggest ? outlinePayload : outlinePayload.omit({ suggestion: true });
  const shape = z.object({
    move: z.enum(moves),
    reply: text.max(12000),
    help: z.object({ level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)].slice(0, ctx.thread.allowedHelp + 1)).describe("Actual help given this turn, not the permission ceiling. suggest requires level 3.") }).strict(),
    track: track.optional(),
    payload,
    delta: z.array(delta).max(6).describe("move names the teaching action; ask is an independent thread-state update allowed with any permitted move, at most once. recordAttempt is only for check_attempt. close requires check_attempt, recordAttempt(result=met), and clearQuestion together, with no ask anywhere in that response. A closed thread must have no open question."),
  }).strict();
  const outputSchema: z.ZodType<TutorOutput> = ctx.newThread
    ? shape.extend({ track: (writing ? z.literal("argument") : track).describe("Declare the track on this first thread response only; omit on later turns.") })
    : shape.omit({ track: true });
  return outputSchema.superRefine((out, validation) => {
    const fail = (message: string) => validation.addIssue({ code: "custom", message });
    const writing = ctx.thread.key === "prewrite";
    if (!(ctx.allowedMoves ?? (writing ? prewriteMoves : issueMoves)).includes(out.move)) fail("教学动作不允许");
    if (out.help.level > ctx.thread.allowedHelp) fail("帮助超过上限");
    if (ctx.newThread ? !out.track : out.track !== undefined) fail("线程类型只在新线程声明");
    if (writing && out.track && out.track !== "argument") fail("写前只能使用论证线程");
    if (!ctx.allowOutline && out.payload.outlineUpdates !== undefined) fail("不允许提纲增量");
    if ((out.move === "suggest") !== (out.payload.suggestion !== undefined)) fail("建议内容只能且必须使用 suggest");
    if (out.move === "suggest" && (writing || out.help.level !== 3 || ctx.thread.allowedHelp !== 3)) fail("示范必须为三级帮助");
    const asks = out.delta.filter(d => d.op === "ask");
    if (asks.length > 1) fail("每轮最多设置一个开放问题");
    const attempts = out.delta.filter(d => d.op === "recordAttempt");
    if (attempts.length && (writing || out.move !== "check_attempt" || attempts.some(d => d.ref !== "cur"))) fail("核验只允许引用本轮尝试");
    if (out.delta.some(d => d.op === "close") && (writing || out.move !== "check_attempt" || !attempts.some(d => d.result === "met") || !out.delta.some(d => d.op === "clearQuestion") || asks.length)) fail("关闭必须与本轮达标核验和清除问题一起提交，且不能设置新问题");
    try { applyDelta(ctx.thread, out, { refs: ctx.refKeys, coachMessageId: "preview" }); } catch (error) { fail(error instanceof Error ? error.message : "增量无效"); }
  });
}
const teachingStateSchema = z.object({ v: z.literal(1), key: z.string().regex(/^(prewrite|issue:[1-9]\d*)$/), status: z.enum(["open", "closed"]), closedReason: z.literal("met").nullable(), track, current: z.object({ target: text, refs: z.array(z.string()) }).nullable(), openQuestion: z.object({ text, askedMessageId: text }).nullable(), established: z.array(z.object({ id: text, text: text.max(200), refMessageId: text, basis: z.literal("student_stated"), archived: z.boolean(), retracted: z.boolean() })), attempts: z.array(z.object({ messageId: text, result, reason: text.max(300), help })).max(3), allowedHelp: help, providedHelp: help.nullable(), legacyLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(), lastMessageId: text.nullable() }).superRefine((t, c) => {
  if (t.established.filter(e => !e.archived && !e.retracted).length > 8 || (t.key === "prewrite" && (t.allowedHelp > 2 || t.track !== "argument")) || (t.status === "closed") !== (t.closedReason === "met") || (t.status === "closed" && t.openQuestion !== null) || new Set(t.established.map(e => e.id)).size !== t.established.length || new Set(t.attempts.map(a => a.messageId)).size !== t.attempts.length) c.addIssue({ code: "custom", message: "线程上限无效" });
});
export const tutorStateSchema = z.object({ v: z.literal(1), brief: z.null(), activeThread: text.nullable(), threads: z.record(z.string(), teachingStateSchema), helpEvents: z.array(z.object({ id: text, at: z.iso.datetime(), entry: z.enum(["prewrite", "chat", "clarify", "polish", "express", "check", "issue", "nudge"]), essayKind: z.enum(["original", "revision"]).nullable(), draftVersion: z.number().int().nonnegative(), level: help.nullable(), track: track.nullable(), suggestionIds: z.array(text), messageId: text.nullable() })).max(200) }).superRefine((state, ctx) => {
  if ((state.activeThread !== null && !Object.hasOwn(state.threads, state.activeThread)) || Object.entries(state.threads).some(([key, thread]) => key !== thread.key)) ctx.addIssue({ code: "custom", message: "线程索引无效" });
});
export class TutorStateError extends Error { readonly status = 409; constructor() { super("这个练习的教学状态需要新版本，请刷新页面"); } }
export function readTutorState(raw: unknown): TutorState | null { if (raw == null) return null; const result = tutorStateSchema.safeParse(raw); if (!result.success) throw new TutorStateError(); return structuredClone(raw) as TutorState; }
