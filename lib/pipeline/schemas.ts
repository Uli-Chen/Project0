import { z } from "zod";
const text = z.string().trim().min(1).max(12000);
const short = z.string().trim().min(1).max(2000);
export const slotPathSchema = z.enum(["stance", "reasons.0.claim", "reasons.0.why", "reasons.0.example", "reasons.1.claim", "reasons.1.why", "reasons.1.example", "counter.view", "counter.response"]);
const slot = z.object({ text: short, sources: z.array(z.string().max(3000)).max(12) }).nullable();
export const outlineSchema = z.object({ stance: slot, reasons: z.array(z.object({ claim: slot, why: slot, example: slot })).length(2), counter: z.object({ view: slot, response: slot }), userEdited: z.boolean() });
const legacyCreateSessionSchema = z.object({ kind: z.enum(["assessment", "task", "free"]).default("free"), mode: z.enum(["practice", "mock"]).default("practice"), prompt: z.string().trim().min(15).max(3000).optional() }).strict();
export const questionCreateSessionSchema = z.object({ questionId: z.string().min(1).max(200), activity: z.enum(["deep", "quick"]), mode: z.enum(["practice", "mock"]), idempotencyKey: z.string().min(1).max(200), rewriteOfDeepId: z.string().min(1).max(200).optional() }).strict();
// Presence of questionId discriminates the two strict shapes; mixed payloads fail.
export const createSessionSchema = z.union([questionCreateSessionSchema, legacyCreateSessionSchema]);
export const lifecycleSchema = z.object({ action: z.enum(["setAside", "resume", "close"]) }).strict();
export const draftSchema = z.object({ requestId: z.string().uuid().optional(), version: z.number().int().nonnegative(), drafts: z.object({ original: z.string().max(30000), revision: z.string().max(30000) }).optional(), elapsed: z.object({ original: z.number().int().min(0).max(604800), revision: z.number().int().min(0).max(604800) }).optional(), outline: outlineSchema.optional(), nudgesEnabled: z.boolean().optional() }).strict();
export const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prewrite"), text: z.string().trim().max(12000).default(""), intent: z.literal("more").optional() }).refine(v => v.intent === "more" || v.text.length > 0, { message: "请输入你的想法", path: ["text"] }),
  z.object({ action: z.literal("startWriting") }),
  z.object({ action: z.enum(["clarify", "polish", "check"]), selection: text }),
  z.object({ action: z.literal("express"), text }),
  z.object({ action: z.literal("chat"), text, quote: text.optional() }),
  z.object({ action: z.literal("suggestion"), id: z.string().max(100), status: z.enum(["accepted", "dismissed"]) }),
  z.object({ action: z.literal("nudge"), kind: z.enum(["original", "revision"]), paragraphIndex: z.number().int().min(0).max(100) }),
  z.object({ action: z.literal("dismissNudge") }),
  z.object({ action: z.literal("evaluate"), kind: z.enum(["original", "revision"]) }),
  z.object({ action: z.literal("retryReview") }),
  z.object({ action: z.literal("startRevision"), openIssue: z.number().int().min(1).max(10).optional() }),
  z.object({ action: z.literal("issue"), rank: z.number().int().min(1).max(10), intent: z.enum(["more", "attempt", "ask"]), text: text.optional() }),
  z.object({ action: z.literal("finish") }),
  z.object({ action: z.literal("rating"), useful: z.number().int().min(1).max(5).nullable(), mine: z.enum(["yes", "partly", "no"]).nullable(), comment: z.string().max(2000) }),
]);
export type AgentAction = z.infer<typeof actionSchema>;
const band = z.number().min(0).max(9).multipleOf(0.5);
const dimensions = { TR: band, CC: band, LR: band, GRA: band };
export const scoresSchema = z.object({ overall: band, dims: z.object(dimensions), rationale: z.object({ TR: short, CC: short, LR: short, GRA: short }) });
export const evaluationSchema = z.object({ scores: scoresSchema, issues: z.array(z.object({ rank: z.number().int().min(1).max(5), code: z.string().max(30), title: short, why: short, sentenceIds: z.array(z.number().int().positive()).max(12), hintL1: short, recurring: z.boolean() })).max(5), review: z.object({ outlineCoverage: z.array(z.object({ slot: slotPathSchema, status: z.enum(["written", "partly", "missing"]) })).max(9), breakthrough: short.nullable(), focusResult: z.object({ achieved: z.enum(["yes", "partial", "no"]), note: short }).nullable(), selfReportContrast: short.nullable(), aiRatio: z.number().min(0).max(1) }) });
export const comparisonSchema = z.object({ issues: z.array(z.object({ rank: z.number().int().positive(), status: z.enum(["resolved", "partly", "unresolved", "removed"]), reason: short, revisionSentenceIds: z.array(z.number().int().positive()).max(12) })).max(5), idea: z.object({ stanceKept: z.boolean(), keptPoints: z.array(short).max(8), deepened: z.array(z.object({ what: short, originalIds: z.array(z.number().int().positive()).max(12), revisionIds: z.array(z.number().int().positive()).max(12) })).max(8), changed: z.array(short).max(8) }), aiRatio: z.number().min(0).max(1) });
export const coachSchema = z.object({ reply: text, suggestions: z.array(z.object({ type: z.enum(["polish", "express", "check"]), selectionText: z.string().max(12000), suggestedText: short, reason: short })).max(3) });
export const prewriteSchema = z.object({ reply: text, updates: z.array(z.object({ path: slotPathSchema, text: short, source: short })).max(9) });
export const finishSchema = z.object({ memoryChanges: z.array(z.object({ kind: z.enum(["new", "recurring", "improving", "resolved", "idea"]), text: short })).min(1).max(8) });
