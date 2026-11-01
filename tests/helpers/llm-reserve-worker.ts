import Database from "better-sqlite3";
import { reserveCall, type ReserveCallInput } from "../../lib/llm/calls";
const sqlite = new Database(process.env.DATABASE_PATH!, { timeout: 5000 });
sqlite.pragma("foreign_keys = ON");
process.on("message", (input: ReserveCallInput) => {
  try { process.send!(reserveCall(input, sqlite)); }
  finally { sqlite.close(); process.disconnect(); }
});
process.send!("ready");
