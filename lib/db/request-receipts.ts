import type Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import { requestReceipts } from "./schema";

export class ReceiptConflict extends Error {
  readonly status = 409;
  readonly code = "idempotency_conflict";
  constructor() { super("同一请求键的参数不同。"); }
}
// Public argument is idempotencyKey; SQL keeps 13 §3's request_key name.
export function getRequestReceipt(sqlite: Database.Database, userId: string, idempotencyKey: string) {
  return drizzle(sqlite).select().from(requestReceipts).where(and(eq(requestReceipts.userId, userId), eq(requestReceipts.requestKey, idempotencyKey))).get() ?? null;
}
export function writeRequestReceipt(sqlite: Database.Database, receipt: Omit<typeof requestReceipts.$inferInsert, "requestKey"> & { idempotencyKey: string }) {
  return sqlite.transaction(() => {
    const { idempotencyKey, ...values } = receipt;
    const previous = getRequestReceipt(sqlite, values.userId, idempotencyKey);
    if (previous) {
      if (previous.action !== values.action || previous.attemptId !== values.attemptId || previous.paramsHash !== values.paramsHash) throw new ReceiptConflict();
      return previous;
    }
    return drizzle(sqlite).insert(requestReceipts).values({ ...values, requestKey: idempotencyKey }).returning().get();
  }).immediate();
}
