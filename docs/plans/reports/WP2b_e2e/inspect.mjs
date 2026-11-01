import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";

const filename = process.env.DATABASE_PATH;
assert.ok(filename && realpathSync(dirname(filename)).startsWith("/private/tmp/opc-wp2b-e2e."));
const db = new Database(filename, { readonly: true, fileMustExist: true });
try {
  for (const query of readFileSync(resolve("docs/plans/reports/WP2b_e2e/queries.sql"), "utf8").split(";").map(q => q.trim()).filter(Boolean)) {
    console.log(query + ";");
    console.log(JSON.stringify(db.prepare(query).all(), null, 2));
  }
} finally { db.close(); }
