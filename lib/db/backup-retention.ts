import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
const pattern = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.db$/;
export async function pruneBackups(directory: string, keepDays: string | undefined, now = Date.now()) {
  if (keepDays === undefined) return 0;
  if (!/^\d+$/.test(keepDays) || Number(keepDays) < 1 || !Number.isSafeInteger(Number(keepDays))) throw new Error("DATABASE_BACKUP_KEEP_DAYS must be a positive integer");
  let count = 0;
  for (const file of await readdir(directory, { withFileTypes: true })) {
    const match = pattern.exec(file.name); if (!file.isFile() || !match) continue;
    const stamp = match[1].replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3");
    if (Date.parse(stamp) < now - Number(keepDays) * 86400000) { await unlink(join(directory, file.name)); count++; }
  }
  return count;
}
