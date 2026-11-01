import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { getDatabaseConfig } from "./config";
import { initializeSchema } from "./initialize";

// For server-side code and CLI scripts only. App code uses lib/db/client.ts.
export function openSqlite() {
  const { filename } = getDatabaseConfig();
  mkdirSync(dirname(filename), { recursive: true });
  const sqlite = new Database(filename, { timeout: 5_000 });
  try {
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    initializeSchema(sqlite);
    return sqlite;
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
