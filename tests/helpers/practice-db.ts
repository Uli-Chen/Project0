import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { importQuestions } from "../../lib/db/import-questions";
import { markNewUserScanned } from "../../lib/db/migrate-0.4";
import { readSession } from "../../lib/pipeline/read-session";
import { createSession } from "../../lib/pipeline/initial";
import type { SessionState } from "../../lib/pipeline/types";
import type { Evaluation } from "../../lib/prototype/types";

export const catalog = JSON.parse(readFileSync(resolve("data/question-bank/question_bank.mock.json"), "utf8"));
export const requirements = JSON.parse(readFileSync(resolve("data/question-bank/requirements.mock.json"), "utf8"));
export const essay = "Public transport can improve the lives of residents because it reduces traffic and makes daily travel cheaper. For example, a reliable bus network allows students to reach their classes without buying a car. Local authorities should therefore invest in frequent services and safe stations. These investments also support shops by making neighbourhoods easier to visit.";
export const evaluation: Evaluation = { scores: { overall: 6, dims: { TR: 6, CC: 6, LR: 6, GRA: 6 }, rationale: { TR: "回应题目", CC: "衔接清楚", LR: "词汇准确", GRA: "语法准确" } }, issues: [{ rank: 1, code: "example", title: "展开例子", why: "例子还未解释后果", sentenceIds: [2], hintL1: "节省开支带来什么影响？", recurring: false }], review: { outlineCoverage: [], breakthrough: null, focusResult: null, selfReportContrast: null, aiRatio: 0 } };
export const time = "2026-11-01T01:00:00.000Z";
export function fixture(importCatalog = true) {
  const directory = mkdtempSync(join(tmpdir(), "opc-practice-facts-")), filename = join(directory, "test.db");
  const sqlite = new Database(filename, { timeout: 5000 });
  sqlite.pragma("journal_mode = WAL"); sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: resolve("drizzle") });
  if (importCatalog) importQuestions(sqlite, catalog, requirements);
  return { sqlite, filename,
    user(id = "u", scanned = true) {
      sqlite.prepare("INSERT INTO users(id,email,name,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)").run(id, `${id}@test.test`, id, "test", time, time);
      if (scanned) markNewUserScanned(sqlite, id, time);
      return id;
    },
    close() { sqlite.close(); rmSync(directory, { recursive: true, force: true }); },
  };
}
export function session(withOutline = false) {
  const s = createSession({ kind: "free", mode: "practice", prompt: catalog.questions[0].text });
  s.stage = "writing"; s.drafts.original = essay;
  if (withOutline) s.outline.stance = { text: "支持公共交通", sources: ["学生输入"] };
  return s;
}
export function save(sqlite: Database.Database, userId: string, state: SessionState) {
  sqlite.prepare(`INSERT INTO writing_sessions(user_id,id,state_json,created_at,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(user_id,id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`).run(userId, state.id, JSON.stringify(state), state.createdAt, state.updatedAt);
}
export function read(sqlite: Database.Database, userId: string, id: string) {
  return readSession((sqlite.prepare("SELECT state_json FROM writing_sessions WHERE user_id=? AND id=?").get(userId, id) as { state_json: string }).state_json);
}
export function table(sqlite: Database.Database, name: string) {
  // Only hard-coded test table names are passed here.
  return sqlite.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all() as Record<string, unknown>[];
}
