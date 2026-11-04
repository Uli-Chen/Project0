import "./load-env";
import { pruneBackups } from "../lib/db/backup-retention";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import Database from "better-sqlite3";
import { getDatabaseConfig } from "../lib/db/config";

async function backup() {
  const { filename, backupDirectory } = getDatabaseConfig();
  // A typo in DATABASE_PATH must not silently produce an empty backup.
  const sqlite = new Database(filename, { fileMustExist: true, readonly: true });
  try {
    await mkdir(backupDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replaceAll(":", "-");
    const destination = join(backupDirectory, `${timestamp}-${randomUUID()}.db`);
    await sqlite.backup(destination);
    await pruneBackups(backupDirectory, process.env.DATABASE_BACKUP_KEEP_DAYS);
    console.log(`SQLite backup complete: ${destination}`);
  } finally {
    sqlite.close();
  }
}

backup().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
