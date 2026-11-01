import Database from "better-sqlite3";
import { commitPracticeCheckpoint } from "../../lib/db/practice-facts";
import { read, save } from "./practice-db";
const [filename, userId, id] = process.argv.slice(2);
const sqlite = new Database(filename, { timeout: 5000 });
sqlite.pragma("foreign_keys = ON");
process.on("message", () => {
  try {
    const state = read(sqlite, userId, id);
    state.submitted.original = state.drafts.original; state.stage = "evaluating";
    commitPracticeCheckpoint(sqlite, userId, state, "acceptOriginal", s => save(sqlite, userId, s));
    process.send?.({ freshness: state.originalFreshness });
    sqlite.close(); process.disconnect();
  } catch (error) { process.send?.({ error: String(error) }); process.exitCode = 1; sqlite.close(); process.disconnect(); }
});
process.send?.("ready");
