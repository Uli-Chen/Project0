import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { AuthError } from "@/lib/auth/http";
import { limitAuth } from "@/lib/auth/rate-limit";
import { getDb } from "@/lib/db/client";
import { acquireExecution, isExecutionActive, pruneExpiredExecutions, type ExecutionLease } from "@/lib/db/execution-leases";
import { ModelError } from "./json";

type RequestBudget = { userId: string; lease?: ExecutionLease };
const budgets = new AsyncLocalStorage<RequestBudget>();
/** One active model workflow per user, eight globally; thirty workflows per user per minute. */
export async function withModelAdmission<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const budget: RequestBudget = { userId };
  return budgets.run(budget, async () => {
    try { return await fn(); } finally { budget.lease?.release(); }
  });
}
export function admitModelCall() {
  const budget = budgets.getStore();
  if (!budget) return;
  if (budget.lease) {
    if (!budget.lease.current()) throw new ModelError("模型处理已中断，请刷新后重试。", 409);
    return;
  }
  const sqlite = getDb().$client;
  try {
    budget.lease = sqlite.transaction(() => {
      pruneExpiredExecutions("model", Date.now(), sqlite);
      if (isExecutionActive("model", budget.userId, sqlite)) throw new ModelError("你已有一个模型请求正在处理，请等待完成后再试。", 429, 5);
      const { count } = sqlite.prepare("SELECT count(*) AS count FROM execution_leases WHERE scope = 'model'").get() as { count: number };
      if (count >= 8) throw new ModelError("模型服务当前繁忙，请稍后重试。", 429, 15);
      limitAuth(`model:${budget.userId}`, 30, 60000);
      const lease = acquireExecution("model", budget.userId, sqlite);
      if (!lease) throw new ModelError("你已有一个模型请求正在处理，请等待完成后再试。", 429, 5);
      return lease;
    }).immediate();
    budget.lease.keepAlive();
  } catch (error) {
    if (error instanceof ModelError) throw error;
    if (error instanceof AuthError && error.status === 429) throw new ModelError("模型请求过于频繁，请一分钟后再试。", 429, 60);
    throw new ModelError("暂时无法处理模型请求，请稍后重试。");
  }
}
