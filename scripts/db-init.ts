import "./load-env";
import { getDatabaseConfig } from "../lib/db/config";
import { openSqlite } from "../lib/db/sqlite";

const sqlite = openSqlite();
try {
  sqlite.prepare("SELECT 1").get();
  console.log(`SQLite ready: ${getDatabaseConfig().filename}`);
} finally {
  sqlite.close();
}
