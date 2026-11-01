import type { QuestionAlias, QuestionResolution } from "../question-bank/types";

// 原型/12 §2.3. Preserve punctuation; no tokenization or approximate matching.
export function normalizeQuestionAlias(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[\s\p{White_Space}]+/gu, " ").trim();
}

type ResolutionContext = {
  aliasVersion: string;
  aliases: readonly QuestionAlias[];
  // Caller supplies catalog records for the migration/checkpoint's catalog version.
  questions: readonly { text: string; exposureKey: string }[];
};

// Pure: callers load versioned records, never consult the database or clock here.
export function resolveQuestion(session: { prompt: { id?: string; text: string } }, context: ResolutionContext): QuestionResolution {
  const id = normalizeQuestionAlias(session.prompt.id ?? "");
  const text = normalizeQuestionAlias(session.prompt.text);
  const aliases = context.aliases.filter((entry) => entry.aliasVersion === context.aliasVersion
    && normalizeQuestionAlias(entry.alias) === (entry.kind === "legacy_id" ? id : text));
  const families = new Set(context.questions.filter((question) => normalizeQuestionAlias(question.text) === text).map((question) => question.exposureKey));
  let notInCatalog = false;
  let ambiguous = false;
  for (const entry of aliases) {
    if (entry.status === "matched" && entry.exposureKey !== null) families.add(entry.exposureKey);
    if (entry.status === "not_in_catalog") notInCatalog = true;
    if (entry.status === "ambiguous") {
      ambiguous = true;
      entry.candidates.forEach((candidate) => families.add(candidate));
    }
  }
  const candidates = [...families].sort();
  // Conflicting exact evidence must not silently resolve previously unknown exposure.
  if (ambiguous || candidates.length > 1 || (notInCatalog && candidates.length > 0)) return { result: "ambiguous", candidates };
  if (candidates.length === 1) return { result: "matched", exposureKey: candidates[0] };
  return { result: notInCatalog ? "not_in_catalog" : "unmatched" };
}
