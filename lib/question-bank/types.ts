import { z } from "zod";

const nonempty = z.string().refine((value) => value.trim().length > 0, "Must not be blank");
export const topicSchema = z.enum(["education", "technology", "environment", "society", "work", "health", "culture"]);
export const questionSchema = z.object({
  id: nonempty, version: z.number().int().positive(), exposureKey: nonempty,
  bankOrder: z.number().int().positive(), text: nonempty,
  primaryTopic: topicSchema, secondaryTopics: z.array(topicSchema).optional().default([]),
  questionType: z.enum(["agree_disagree", "discuss_both", "adv_disadv", "problem_solution", "two_part"]),
  pool: z.enum(["practice", "checkpoint_reserved"]),
  source: z.object({
    kind: z.enum(["local_excerpt", "adapted_local", "synthetic", "exam_recall", "cambridge_ielts"]),
    path: nonempty.nullable(), locator: nonempty.nullable(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(), note: nonempty,
  }).strict(),
}).strict();
export const catalogSchema = z.object({
  bankVersion: nonempty, status: z.enum(["mock_not_production", "task2_source_snapshot"]), questions: z.array(questionSchema).min(1),
}).strict();
export const requirementSchema = z.object({
  id: nonempty, version: z.number().int().positive(),
  subquestions: z.array(z.object({ key: nonempty, en: nonempty, zh: nonempty }).strict()).min(1),
  layout: z.enum(["position_reasons", "both_views_opinion", "weigh", "problem_solution", "two_questions"]),
  requiresOverallJudgement: z.boolean(),
}).strict();
export const aliasSchema = z.object({
  aliasVersion: nonempty, kind: z.enum(["legacy_id", "text"]), alias: nonempty,
  status: z.enum(["matched", "not_in_catalog", "ambiguous"]), exposureKey: nonempty.nullable(),
  reviewedBy: nonempty, note: nonempty, candidates: z.array(nonempty),
}).strict().superRefine((value, context) => {
  if ((value.status === "matched") !== (value.exposureKey !== null)) {
    context.addIssue({ code: "custom", message: "Only matched aliases must have an exposureKey" });
  }
  if (value.status === "ambiguous" ? new Set(value.candidates).size < 2 : value.candidates.length !== 0) {
    context.addIssue({ code: "custom", message: "Only ambiguous aliases must have at least two candidate families" });
  }
  if (new Set(value.candidates).size !== value.candidates.length) {
    context.addIssue({ code: "custom", message: "Duplicate alias candidates" });
  }
});
export type Catalog = z.infer<typeof catalogSchema>;
export type CatalogQuestion = z.infer<typeof questionSchema>;
export type QuestionRequirements = z.infer<typeof requirementSchema>;
export type QuestionAlias = z.infer<typeof aliasSchema>;
export type QuestionResolution = { result: "matched"; exposureKey: string } | { result: "not_in_catalog" } | { result: "ambiguous"; candidates: string[] } | { result: "unmatched" };
