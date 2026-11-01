import type Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { questions, questionAliases, questionAliasCandidates } from "./schema";
import { aliasVersion } from "../question-bank/aliases";
import { resolveQuestion } from "../rules/resolve-question";
import type { SessionState } from "../pipeline/types";

export function questionContext(sqlite: Database.Database, version = aliasVersion) {
  const db = drizzle(sqlite);
  const catalog = db.select().from(questions).all();
  const candidates = db.select().from(questionAliasCandidates).where(eq(questionAliasCandidates.aliasVersion, version)).all();
  const aliases = db.select().from(questionAliases).where(eq(questionAliases.aliasVersion, version)).all().map(a => ({
    ...a, candidates: candidates.filter(c => c.kind === a.kind && c.alias === a.alias).map(c => c.exposureKey),
  }));
  return { questions: catalog, aliases, aliasVersion: version };
}
export type QuestionContext = ReturnType<typeof questionContext>;

export function resolveAttempt(state: SessionState, context: QuestionContext) {
  const resolution = state.question ? { result: "matched" as const, exposureKey: state.question.exposureKey }
    : resolveQuestion(state, context);
  const exposureKey = resolution.result === "matched" ? resolution.exposureKey : null;
  // A pasted prompt can establish family familiarity without becoming a bank entry.
  return { resolution, exposureKey, questionId: state.question?.id ?? null,
    questionVersion: state.question?.version ?? null, primaryTopic: state.question?.primaryTopic ?? null,
    questionType: state.question?.questionType ?? state.prompt?.questionType ?? null };
}
