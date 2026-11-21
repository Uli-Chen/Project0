import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { acquireExecution, isExecutionActive, type ExecutionLease } from "../db/execution-leases";
import { SessionError } from "./engine";

const heldSession = new AsyncLocalStorage<{ key: string; lease: ExecutionLease }>();

export const isSessionBusy = (key: string) => isExecutionActive("session", key);

/** Check under the same SQLite write transaction that will persist the result. */
export function assertSessionLease(key: string) {
  const held = heldSession.getStore();
  if (held?.key === key && !held.lease.current()) {
    throw new SessionError("练习的处理已中断，请刷新后重试。", 409, "session_lease_expired");
  }
}

export async function withSessionLock<T>(key: string, fn: () => T | Promise<T>): Promise<T> {
  const lease = acquireExecution("session", key);
  if (!lease) throw new SessionError("这个练习正在处理另一个请求，请稍后重试。", 409);
  lease.keepAlive();
  try { return await heldSession.run({ key, lease }, fn); }
  finally { lease.release(); }
}
