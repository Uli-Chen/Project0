import { z } from "zod";
import { requirementSchema } from "../question-bank/types";

export const provenanceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("direct"), userId: z.string(), editId: z.string(), editedAt: z.string(), contentVersion: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal("excerpt"), userId: z.string(), messageId: z.string(), start: z.number().int().nonnegative(), end: z.number().int().positive() }).strict(),
]);
// Count Unicode code points; excerpt offsets remain JavaScript UTF-16 indices.
export const partTextSchema = z.string().refine(t => t.trim().length > 0 && [...t].length <= 600, "卡片文字须为 1～600 字。");
export const partSchema = z.object({ key: z.string(), text: partTextSchema, provenance: provenanceSchema, afterFollowUp: z.union([z.literal(0), z.literal(1), z.literal(2)]) }).strict();
export const cardContentSchema = z.object({ layout: requirementSchema.shape.layout, parts: z.array(partSchema) }).strict();
export const cardStateSchema = z.enum(["draft", "needs_development", "passed", "unchecked"]);
export const cardSnapshotSchema = z.object({ cardId: z.string(), contentVersion: z.number().int().nonnegative(), content: cardContentSchema,
  state: cardStateSchema, lastCheckedVersion: z.number().int().nonnegative().nullable(), snapshotAt: z.string() }).strict();
export type Provenance = z.infer<typeof provenanceSchema>;
export type Part = z.infer<typeof partSchema>;
export type CardContent = z.infer<typeof cardContentSchema>;
export type CardSnapshot = z.infer<typeof cardSnapshotSchema>;
const envelope = { requestId: z.string().uuid().optional(), idempotencyKey: z.string().min(1).max(200).optional() };
const cardVersion = z.number().int().nonnegative();
const key = z.string().min(1).max(200);
export const cardSaveSchema = z.object({ ...envelope, action: z.literal("cardSave"), cardVersion,
  parts: z.array(z.object({ key, text: z.string().trim().refine(t => [...t].length <= 600, "卡片文字最多 600 字。") }).strict()).max(100)
    .refine(parts => new Set(parts.map(p => p.key)).size === parts.length, "槽位不能重复。"),
}).strict();
export const cardExcerptSchema = z.object({ ...envelope, action: z.literal("cardExcerpt"), cardVersion, key,
  messageId: z.string().min(1).max(200), start: z.number().int().nonnegative(), end: z.number().int().positive(),
}).strict();
export const quickAnswerSchema = z.object({ ...envelope, action: z.literal("quickAnswer"), text: z.string().trim().min(1).max(12000) }).strict();
export const continueDeepSchema = z.object({ ...envelope, action: z.literal("continueDeep"), explicitNew: z.boolean() }).strict()
  .refine(input => !input.explicitNew || !!input.idempotencyKey, "另开一次练习需要幂等键。");
export const quickActionSchema = z.discriminatedUnion("action", [cardSaveSchema, cardExcerptSchema, quickAnswerSchema, continueDeepSchema]);
export type QuickAction = z.infer<typeof quickActionSchema>;
export const quickActionNames = new Set(["cardSave", "cardExcerpt", "quickAnswer", "continueDeep", "quickFollowup", "quickCheck", "quickRetry", "quickSupplemental"]);
