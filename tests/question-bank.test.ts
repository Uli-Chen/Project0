import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { importQuestions } from "../lib/db/import-questions";
import { aliasVersion, initialQuestionAliases } from "../lib/question-bank/aliases";
import { catalogSchema, requirementSchema, type QuestionAlias } from "../lib/question-bank/types";
import { normalizeQuestionAlias, resolveQuestion } from "../lib/rules/resolve-question";

const catalog = catalogSchema.parse(JSON.parse(readFileSync(resolve("data/question-bank/question_bank.mock.json"), "utf8")));
const requirements = requirementSchema.array().parse(JSON.parse(readFileSync(resolve("data/question-bank/requirements.mock.json"), "utf8")));
function database() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: resolve("drizzle") });
  return sqlite;
}
function snapshot(sqlite: Database.Database) {
  return {
    questions: sqlite.prepare("SELECT * FROM questions ORDER BY id, version").all(),
    aliases: sqlite.prepare("SELECT * FROM question_aliases ORDER BY alias_version, kind, alias").all(),
    candidates: sqlite.prepare("SELECT * FROM question_alias_candidates ORDER BY alias_version, kind, alias, exposure_key").all(),
  };
}
function upgrade() {
  const next = structuredClone(catalog), nextRequirements = structuredClone(requirements);
  next.bankVersion = "mock-test-v2";
  next.questions[0].version = 2;
  next.questions[0].text += " "; // Cosmetic revision; the family remains unchanged.
  nextRequirements[0].version = 2;
  return { next, nextRequirements };
}

test("catalog import is idempotent and installs precisely the seven confirmed legacy aliases", () => {
  const sqlite = database();
  try {
    assert.deepEqual(importQuestions(sqlite, catalog, requirements), { bankVersion: catalog.bankVersion, questions: 38, inserted: 38, aliasesInserted: 7 });
    const before = snapshot(sqlite);
    assert.equal(before.questions.length, 38); assert.equal(before.aliases.length, 7);
    assert.deepEqual(importQuestions(sqlite, catalog, requirements), { bankVersion: catalog.bankVersion, questions: 38, inserted: 0, aliasesInserted: 0 });
    assert.deepEqual(snapshot(sqlite), before);
    assert.deepEqual(sqlite.prepare("SELECT count(*) AS n FROM question_aliases WHERE status = 'matched'").get(), { n: 2 });
    assert.deepEqual(sqlite.prepare("SELECT count(*) AS n FROM question_aliases WHERE status = 'not_in_catalog'").get(), { n: 5 });
    const records = sqlite.prepare("SELECT alias_version AS aliasVersion, kind, alias, status, exposure_key AS exposureKey, reviewed_by AS reviewedBy, note FROM question_aliases").all() as Omit<QuestionAlias, "candidates">[];
    const aliases = records.map((row) => ({ ...row, candidates: [] }));
    for (const expected of initialQuestionAliases) {
      const prompt = expected.kind === "legacy_id" ? { id: expected.alias, text: "" } : { text: expected.alias };
      const result = resolveQuestion({ prompt }, { aliasVersion, aliases, questions: catalog.questions });
      assert.equal(result.result, expected.status);
      if (result.result === "matched") assert.equal(result.exposureKey, "qfamily_remote_work");
    }
  } finally { sqlite.close(); }
});

test("v2 retains frozen v1, switches current version, and an old catalog replay cannot downgrade it", () => {
  const sqlite = database();
  try {
    importQuestions(sqlite, catalog, requirements);
    const { next, nextRequirements } = upgrade();
    importQuestions(sqlite, next, nextRequirements);
    const rows = sqlite.prepare("SELECT version, is_current, text, bank_version FROM questions WHERE id = ? ORDER BY version").all(catalog.questions[0].id);
    assert.deepEqual(rows, [
      { version: 1, is_current: 0, text: catalog.questions[0].text, bank_version: catalog.bankVersion },
      { version: 2, is_current: 1, text: next.questions[0].text, bank_version: next.bankVersion },
    ]);
    assert.equal(snapshot(sqlite).questions.length, 39);
    const before = snapshot(sqlite);
    importQuestions(sqlite, next, nextRequirements);
    importQuestions(sqlite, catalog, requirements);
    assert.deepEqual(snapshot(sqlite), before);
  } finally { sqlite.close(); }
});

test("missing requirements rejects the entire import on empty and populated databases", () => {
  const sqlite = database();
  try {
    const empty = snapshot(sqlite);
    assert.throws(() => importQuestions(sqlite, catalog, requirements.slice(0, -1)), /Missing requirements/);
    assert.deepEqual(snapshot(sqlite), empty);
    importQuestions(sqlite, catalog, requirements);
    const before = snapshot(sqlite), { next, nextRequirements } = upgrade();
    assert.throws(() => importQuestions(sqlite, next, nextRequirements.slice(0, -1)), /Missing requirements/);
    assert.deepEqual(snapshot(sqlite), before);
  } finally { sqlite.close(); }
});

test("same id/version rejects every frozen field change, including requirements alone", () => {
  const sqlite = database();
  try {
    importQuestions(sqlite, catalog, requirements);
    const before = snapshot(sqlite);
    for (const change of [
      { text: "Changed question" }, { primaryTopic: "work", secondaryTopics: [] }, { secondaryTopics: ["health"] },
      { exposureKey: "other-family" }, { pool: "checkpoint_reserved" }, { questionType: "two_part" },
      { bankOrder: 100 }, { source: { ...catalog.questions[0].source, note: "Changed source" } },
    ]) {
      const next = structuredClone(catalog);
      Object.assign(next.questions[0], change);
      assert.throws(() => importQuestions(sqlite, next, requirements), /Frozen question content differs/);
      assert.deepEqual(snapshot(sqlite), before);
    }
    for (const change of [
      { subquestions: [{ ...requirements[0].subquestions[0], zh: "仅要求说明不同" }] },
      { layout: "two_questions" }, { requiresOverallJudgement: false },
    ]) {
      const changedRequirements = structuredClone(requirements);
      Object.assign(changedRequirements[0], change);
      assert.throws(() => importQuestions(sqlite, catalog, changedRequirements), /Frozen question content differs/);
      assert.deepEqual(snapshot(sqlite), before);
    }
  } finally { sqlite.close(); }
});

test("late question conflict rolls back earlier inserts; late alias conflict rolls back version switches and alias writes", () => {
  const sqlite = database();
  try {
    importQuestions(sqlite, catalog, requirements);
    const before = snapshot(sqlite), { next, nextRequirements } = upgrade();
    next.questions.at(-1)!.text += " Changed";
    assert.throws(() => importQuestions(sqlite, next, nextRequirements), /Frozen question content differs/);
    assert.deepEqual(snapshot(sqlite), before);
    next.questions.at(-1)!.text = catalog.questions.at(-1)!.text;
    const aliases = [{ ...initialQuestionAliases[0], alias: "new-alias" }, { ...initialQuestionAliases[0], note: "Changed review" }];
    assert.throws(() => importQuestions(sqlite, next, nextRequirements, aliases), /Frozen alias content differs/);
    assert.deepEqual(snapshot(sqlite), before);
    const unknown = [{ ...initialQuestionAliases[0], alias: "unknown-family", exposureKey: "not-a-family" }];
    assert.throws(() => importQuestions(sqlite, next, nextRequirements, unknown), /Unknown alias family/);
    assert.deepEqual(snapshot(sqlite), before);
  } finally { sqlite.close(); }
});

test("requirements must match catalog one-to-one and have unique nonempty subquestions", () => {
  const sqlite = database();
  try {
    for (const invalid of [
      [...requirements, requirements[0]],
      [...requirements, { ...requirements[0], id: "extra" }],
      requirements.map((entry, i) => i === 0 ? { ...entry, version: 2 } : entry),
      requirements.map((entry, i) => i === 0 ? { ...entry, subquestions: [] } : entry),
      requirements.map((entry, i) => i === 0 ? { ...entry, subquestions: [entry.subquestions[0], entry.subquestions[0]] } : entry),
    ]) {
      assert.throws(() => importQuestions(sqlite, catalog, invalid));
      assert.equal(snapshot(sqlite).questions.length, 0);
    }
    assert.throws(() => importQuestions(sqlite, { ...catalog, questions: [...catalog.questions, catalog.questions[0]] }, requirements), /Duplicate catalog id/);
    const next = structuredClone(catalog); next.questions[0].bankOrder = next.questions[1].bankOrder;
    assert.throws(() => importQuestions(sqlite, next, requirements), /Duplicate bankOrder/);
    // Content is explicitly authored, not split from question type at runtime.
    for (const [i, entry] of requirements.entries()) for (const part of entry.subquestions) assert.ok(catalog.questions[i].text.includes(part.en), `${entry.id}: English must quote the prompt`);
  } finally { sqlite.close(); }
});

test("partial unique indexes allow historical orders but reject duplicate current IDs and orders", () => {
  const sqlite = database();
  try {
    importQuestions(sqlite, catalog, requirements);
    const { next, nextRequirements } = upgrade();
    importQuestions(sqlite, next, nextRequirements);
    assert.throws(() => sqlite.prepare("UPDATE questions SET is_current = 1 WHERE id = ? AND version = 1").run(catalog.questions[0].id), /UNIQUE constraint failed/);
    assert.throws(() => sqlite.prepare("UPDATE questions SET bank_order = 2 WHERE id = ? AND is_current = 1").run(catalog.questions[0].id), /UNIQUE constraint failed/);
    assert.throws(() => sqlite.prepare("UPDATE questions SET is_current = 2 WHERE id = ?").run(catalog.questions[0].id), /CHECK constraint failed/);
    const swap = structuredClone(next), swapRequirements = structuredClone(nextRequirements);
    for (const i of [0, 1]) { swap.questions[i].version++; swapRequirements[i].version++; }
    [swap.questions[0].bankOrder, swap.questions[1].bankOrder] = [swap.questions[1].bankOrder, swap.questions[0].bankOrder];
    importQuestions(sqlite, swap, swapRequirements);
    assert.deepEqual(sqlite.prepare("SELECT bank_order FROM questions WHERE id = ? AND is_current = 1").get(catalog.questions[0].id), { bank_order: 2 });
  } finally { sqlite.close(); }
});

test("ambiguous candidates persist, are versioned and immutable, and reject invalid states", () => {
  const sqlite = database();
  try {
    const candidates = [catalog.questions[0].exposureKey, catalog.questions[1].exposureKey].sort();
    const ambiguous: QuestionAlias = { ...initialQuestionAliases[0], kind: "text", alias: "  ＡＭＢＩＧＵＯＵＳ　prompt ", status: "ambiguous", exposureKey: null, candidates };
    const aliases = [...initialQuestionAliases, ambiguous];
    importQuestions(sqlite, catalog, requirements, aliases);
    const before = snapshot(sqlite);
    assert.equal(before.candidates.length, 2);
    importQuestions(sqlite, catalog, requirements, aliases);
    assert.deepEqual(snapshot(sqlite), before);
    const readCandidates = sqlite.prepare("SELECT exposure_key FROM question_alias_candidates WHERE alias = 'ambiguous prompt' ORDER BY exposure_key").all() as { exposure_key: string }[];
    assert.deepEqual(resolveQuestion({ prompt: { text: "ambiguous prompt" } }, { aliasVersion, aliases: [{ ...ambiguous, candidates: readCandidates.map((row) => row.exposure_key) }], questions: [] }), { result: "ambiguous", candidates });
    assert.throws(() => importQuestions(sqlite, catalog, requirements, [{ ...ambiguous, candidates: [candidates[0], catalog.questions[2].exposureKey] }]), /Frozen alias content differs/);
    for (const invalid of [
      { ...ambiguous, candidates: [] }, { ...ambiguous, candidates: [candidates[0]] },
      { ...ambiguous, exposureKey: candidates[0] }, { ...ambiguous, status: "not_in_catalog" },
      { ...initialQuestionAliases[0], exposureKey: null },
    ]) assert.throws(() => importQuestions(sqlite, catalog, requirements, [invalid]));
    assert.deepEqual(snapshot(sqlite), before);
    const revised = { ...ambiguous, aliasVersion: "review-v2", status: "matched", exposureKey: candidates[0], candidates: [] };
    importQuestions(sqlite, catalog, requirements, [revised]);
    assert.equal(snapshot(sqlite).aliases.length, 9);
    assert.throws(() => sqlite.prepare("INSERT INTO question_alias_candidates VALUES (?, ?, ?, ?)").run(aliasVersion, "text", "absent", candidates[0]), /FOREIGN KEY constraint failed/);
    assert.throws(() => sqlite.prepare("UPDATE question_aliases SET exposure_key = 'invalid' WHERE status = 'not_in_catalog'").run(), /CHECK constraint failed/);
  } finally { sqlite.close(); }
});

test("alias normalization: NFKC, lowercase, whitespace; preserve punctuation and non-equivalent letters", () => {
  assert.equal(normalizeQuestionAlias("　ＡＢＣ\u00a0\tＤｅｆ\r\n? "), "abc def ?");
  assert.equal(normalizeQuestionAlias("ﬃ Ｗork"), normalizeQuestionAlias("FFI work"));
  assert.equal(normalizeQuestionAlias("e\u0301"), normalizeQuestionAlias("é"));
  assert.notEqual(normalizeQuestionAlias("ı"), normalizeQuestionAlias("i"));
  assert.notEqual(normalizeQuestionAlias("What's next?"), normalizeQuestionAlias("Whats next?"));
  assert.notEqual(normalizeQuestionAlias("what’s next?"), normalizeQuestionAlias("what's next?"));
  assert.equal(normalizeQuestionAlias(normalizeQuestionAlias(" ＴＥＳＴ　Ab ")), normalizeQuestionAlias(" ＴＥＳＴ　Ab "));
});

test("resolver returns matched, not_in_catalog, ambiguous and unmatched without fuzzy matching", () => {
  const ambiguous: QuestionAlias = { ...initialQuestionAliases[0], kind: "text", alias: "ambiguous", status: "ambiguous", exposureKey: null, candidates: ["family-b", "family-a"] };
  const context = { aliasVersion, aliases: [...initialQuestionAliases, ambiguous], questions: catalog.questions };
  assert.deepEqual(resolveQuestion({ prompt: { id: " ＴＥＣＨＮＯＬＯＧＹ ", text: "" } }, context), { result: "matched", exposureKey: "qfamily_remote_work" });
  assert.deepEqual(resolveQuestion({ prompt: { id: "education", text: "" } }, context), { result: "not_in_catalog" });
  assert.deepEqual(resolveQuestion({ prompt: { text: "ＡＭＢＩＧＵＯＵＳ" } }, context), { result: "ambiguous", candidates: ["family-a", "family-b"] });
  assert.deepEqual(resolveQuestion({ prompt: { text: "unregistered" } }, context), { result: "unmatched" });
  assert.deepEqual(resolveQuestion({ prompt: { text: catalog.questions[0].text.toUpperCase().replaceAll(" ", "　") } }, context), { result: "matched", exposureKey: catalog.questions[0].exposureKey });
  assert.deepEqual(resolveQuestion({ prompt: { text: catalog.questions[0].text.slice(0, -1) } }, context), { result: "unmatched" });
  assert.deepEqual(resolveQuestion({ prompt: { id: "technology", text: "" } }, { ...context, aliasVersion: "unknown-version" }), { result: "unmatched" });
  // Contradictory exact evidence stays unresolved; no guessed precedence.
  assert.deepEqual(resolveQuestion({ prompt: { id: "education", text: catalog.questions[0].text } }, context), { result: "ambiguous", candidates: [catalog.questions[0].exposureKey] });
  assert.deepEqual(resolveQuestion({ prompt: { text: "collision" } }, { ...context, questions: [{ text: "collision", exposureKey: "b" }, { text: "ＣＯＬＬＩＳＩＯＮ", exposureKey: "a" }] }), { result: "ambiguous", candidates: ["a", "b"] });
});
