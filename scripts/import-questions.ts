import "./load-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importQuestions } from "../lib/db/import-questions";
import { openSqlite } from "../lib/db/sqlite";

// Apply migrations first. Optional paths support reviewing a future catalog
// without editing the frozen mock. DATABASE_PATH selects the target database.
const [catalogPath = "data/question-bank/question_bank.mock.json", requirementsPath = "data/question-bank/requirements.mock.json"] = process.argv.slice(2);
try {
  const catalog: unknown = JSON.parse(readFileSync(resolve(catalogPath), "utf8"));
  const requirements: unknown = JSON.parse(readFileSync(resolve(requirementsPath), "utf8"));
  const sqlite = openSqlite();
  try { console.log(JSON.stringify(importQuestions(sqlite, catalog, requirements))); }
  finally { sqlite.close(); }
} catch (error) {
  console.error("Question import failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
