import "server-only";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { openSqlite } from "./sqlite";

function createDatabase() {
  return drizzle(openSqlite(), { schema });
}

const databaseGlobal = globalThis as typeof globalThis & {
  project0Database?: ReturnType<typeof createDatabase>;
};

// Lazy connection: builds and empty pages do not create a database.
// Reuse the connection across development hot reloads.
export function getDb() {
  return (databaseGlobal.project0Database ??= createDatabase());
}
