import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { AuthError } from "@/lib/auth/http";
import { limitAuth } from "@/lib/auth/rate-limit";
import { ModelError } from "./json";

type RequestBudget = { userId: string; admitted: boolean };
const budgets = new AsyncLocalStorage<RequestBudget>();
const globalAdmission = globalThis as typeof globalThis & { modelUsers?: Set<string> };
const activeUsers = globalAdmission.modelUsers ??= new Set<string>();
/** One active model workflow per user, eight globally; thirty workflows per user per minute. */
export async function withModelAdmission<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const budget = { userId, admitted: false };
  return budgets.run(budget, async () => {
    try { return await fn(); } finally { if (budget.admitted) activeUsers.delete(userId); }
  });
}
export function admitModelCall() {
  const budget = budgets.getStore();
  if (!budget || budget.admitted) return;
  if (activeUsers.has(budget.userId)) throw new ModelError("你已有一个模型请求正在处理，请等待完成后再试。", 429, 5);
  if (activeUsers.size >= 8) throw new ModelError("模型服务当前繁忙，请稍后重试。", 429, 15);
  try { limitAuth(`model:${budget.userId}`, 30, 60000); }
  catch (error) {
    if (error instanceof AuthError && error.status === 429) throw new ModelError("模型请求过于频繁，请一分钟后再试。", 429, 60);
    throw new ModelError("暂时无法处理模型请求，请稍后重试。");
  }
  activeUsers.add(budget.userId);
  budget.admitted = true;
}
