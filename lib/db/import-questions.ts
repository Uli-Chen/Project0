import type Database from "better-sqlite3";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { initialQuestionAliases } from "../question-bank/aliases";
import { aliasSchema, catalogSchema, requirementSchema, type CatalogQuestion, type QuestionRequirements } from "../question-bank/types";
import { normalizeQuestionAlias } from "../rules/resolve-question";

function rowFor(question: CatalogQuestion, requirements: QuestionRequirements, bankVersion: string) {
  return {
    id: question.id, version: question.version, exposure_key: question.exposureKey,
    bank_order: question.bankOrder, text: question.text, primary_topic: question.primaryTopic,
    secondary_topics_json: JSON.stringify(question.secondaryTopics), question_type: question.questionType,
    pool: question.pool, source_json: JSON.stringify(question.source), requirements_json: JSON.stringify(requirements),
    bank_version: bankVersion,
  };
}
type QuestionRow = ReturnType<typeof rowFor> & { is_current: number };
function frozenContent(row: ReturnType<typeof rowFor>) {
  // bank_version records the catalog that first introduced this immutable version.
  // Reusing an unchanged question in a later release must not rewrite its origin.
  const { bank_version, ...content } = row;
  void bank_version;
  return { ...content, secondary_topics_json: JSON.parse(row.secondary_topics_json), source_json: JSON.parse(row.source_json), requirements_json: JSON.parse(row.requirements_json) };
}

// CLI/server only; connection is injected so tests never open the application DB.
// Every validation, version switch, question and alias write shares one transaction.
export function importQuestions(sqlite: Database.Database, rawCatalog: unknown, rawRequirements: unknown, rawAliases: unknown = initialQuestionAliases) {
  return sqlite.transaction(() => {
    const catalog = catalogSchema.parse(rawCatalog);
    const requirements = z.array(requirementSchema).parse(rawRequirements);
    const aliases = z.array(aliasSchema).parse(rawAliases).map((entry) => ({ ...entry, alias: normalizeQuestionAlias(entry.alias), candidates: [...entry.candidates].sort() }));
    const required = new Map<string, QuestionRequirements>();
    const key = (entry: { id: string; version: number }) => JSON.stringify([entry.id, entry.version]);
    for (const entry of requirements) {
      if (required.has(key(entry))) throw new Error(`Duplicate requirements: ${entry.id}@${entry.version}`);
      if (new Set(entry.subquestions.map((part) => part.key)).size !== entry.subquestions.length) throw new Error(`Duplicate subquestion key: ${entry.id}`);
      required.set(key(entry), entry);
    }
    const ids = new Set<string>(), orders = new Set<number>();
    const rows = catalog.questions.map((question) => {
      if (ids.has(question.id)) throw new Error(`Duplicate catalog id: ${question.id}`);
      if (orders.has(question.bankOrder)) throw new Error(`Duplicate bankOrder: ${question.bankOrder}`);
      ids.add(question.id); orders.add(question.bankOrder);
      if (question.secondaryTopics.includes(question.primaryTopic) || new Set(question.secondaryTopics).size !== question.secondaryTopics.length) throw new Error(`Invalid secondary topics: ${question.id}`);
      const requirement = required.get(key(question));
      if (!requirement) throw new Error(`Missing requirements: ${question.id}@${question.version}`);
      required.delete(key(question));
      return rowFor(question, requirement, catalog.bankVersion);
    });
    if (required.size) throw new Error(`Requirements without catalog question: ${[...required.values()].map((entry) => `${entry.id}@${entry.version}`).join(", ")}`);

    const find = sqlite.prepare("SELECT * FROM questions WHERE id = ? AND version = ?");
    const history = sqlite.prepare("SELECT version, exposure_key FROM questions WHERE id = ? ORDER BY version DESC");
    const retire = sqlite.prepare("UPDATE questions SET is_current = 0 WHERE id = ? AND is_current = 1");
    const insert = sqlite.prepare(`INSERT INTO questions (id, version, exposure_key, bank_order, text, primary_topic, secondary_topics_json, question_type, pool, source_json, requirements_json, bank_version, is_current)
      VALUES (@id, @version, @exposure_key, @bank_order, @text, @primary_topic, @secondary_topics_json, @question_type, @pool, @source_json, @requirements_json, @bank_version, 0)`);
    const activate = sqlite.prepare("UPDATE questions SET is_current = 1 WHERE id = ? AND version = ?");
    const switches: typeof rows = [];
    let inserted = 0;
    for (const row of rows) {
      const existing = find.get(row.id, row.version) as QuestionRow | undefined;
      if (existing) {
        const { is_current, ...frozen } = existing;
        void is_current;
        if (!isDeepStrictEqual(frozenContent(frozen), frozenContent(row))) throw new Error(`Frozen question content differs: ${row.id}@${row.version}`);
      }
      const versions = history.all(row.id) as { version: number; exposure_key: string }[];
      if (versions.some((old) => old.exposure_key !== row.exposure_key)) throw new Error(`Question family cannot change for id: ${row.id}`);
      if (!existing) { insert.run(row); inserted++; }
      // Old catalog replay preserves the newest current version. Missing IDs are
      // retained: removal/retirement is not specified by this import contract.
      if (!versions.length || row.version >= versions[0].version) switches.push(row);
    }
    // Retire all affected IDs before activating; a release may swap their orders.
    for (const row of switches) retire.run(row.id);
    for (const row of switches) activate.run(row.id, row.version);

    const knownFamilies = new Set((sqlite.prepare("SELECT DISTINCT exposure_key FROM questions").all() as { exposure_key: string }[]).map((row) => row.exposure_key));
    const aliasKeys = new Set<string>();
    let aliasesInserted = 0;
    for (const entry of aliases) {
      const aliasKey = JSON.stringify([entry.aliasVersion, entry.kind, entry.alias]);
      if (!entry.alias || aliasKeys.has(aliasKey)) throw new Error(`Duplicate or empty normalized alias: ${entry.alias}`);
      aliasKeys.add(aliasKey);
      for (const family of entry.exposureKey === null ? entry.candidates : [entry.exposureKey]) {
        if (!knownFamilies.has(family)) throw new Error(`Unknown alias family: ${family}`);
      }
      const record = { alias_version: entry.aliasVersion, kind: entry.kind, alias: entry.alias, status: entry.status, exposure_key: entry.exposureKey, reviewed_by: entry.reviewedBy, note: entry.note };
      const existing = sqlite.prepare("SELECT * FROM question_aliases WHERE alias_version = ? AND kind = ? AND alias = ?").get(entry.aliasVersion, entry.kind, entry.alias);
      if (existing) {
        const candidates = (sqlite.prepare("SELECT exposure_key FROM question_alias_candidates WHERE alias_version = ? AND kind = ? AND alias = ? ORDER BY exposure_key").all(entry.aliasVersion, entry.kind, entry.alias) as { exposure_key: string }[]).map((row) => row.exposure_key);
        if (!isDeepStrictEqual(existing, record) || !isDeepStrictEqual(candidates, entry.candidates)) throw new Error(`Frozen alias content differs: ${entry.alias}`);
      } else {
        sqlite.prepare("INSERT INTO question_aliases (alias_version, kind, alias, status, exposure_key, reviewed_by, note) VALUES (@alias_version, @kind, @alias, @status, @exposure_key, @reviewed_by, @note)").run(record);
        for (const family of entry.candidates) sqlite.prepare("INSERT INTO question_alias_candidates (alias_version, kind, alias, exposure_key) VALUES (?, ?, ?, ?)").run(entry.aliasVersion, entry.kind, entry.alias, family);
        aliasesInserted++;
      }
    }
    return { bankVersion: catalog.bankVersion, questions: rows.length, inserted, aliasesInserted };
  }).immediate();
}
