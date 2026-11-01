import "./load-env";
import { openSqlite } from "../lib/db/sqlite";
import { scanUnscannedUsers } from "../lib/db/migrate-0.4";

// Run db:migrate and db:import-questions first. Never rewrites session JSON.
const sqlite = openSqlite();
try {
  const result = scanUnscannedUsers(sqlite);
  console.log(JSON.stringify(result));
  if (result.failed) process.exitCode = 1;
} finally { sqlite.close(); }
