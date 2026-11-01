import "server-only";
import { SessionError } from "./engine";
const globalLocks = globalThis as typeof globalThis & { sessionLocks?: Set<string> };
const locks = globalLocks.sessionLocks ??= new Set();
export const isSessionBusy = (key: string) => locks.has(key);
export async function withSessionLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (locks.has(key)) throw new SessionError("这个练习正在处理另一个请求，请稍后重试。", 409);
  locks.add(key);
  try { return await fn(); } finally { locks.delete(key); }
}
