import { resolve } from "node:path";
import { z } from "zod";

const databaseEnvironment = z.object({
  DATABASE_PATH: z.string().trim().min(1).default("./data/app.db"),
  DATABASE_BACKUP_DIR: z.string().trim().min(1).default("./backups"),
});

export function getDatabaseConfig() {
  const env = databaseEnvironment.parse(process.env);
  return {
    filename: resolve(env.DATABASE_PATH),
    backupDirectory: resolve(env.DATABASE_BACKUP_DIR),
  };
}
