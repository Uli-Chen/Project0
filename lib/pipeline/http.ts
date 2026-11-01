import "server-only";
import { apiError } from "@/lib/auth/http";
import { ModelError } from "@/lib/llm/json";
import { SessionError } from "./engine";
import { isSupportedSession } from "./read-session";
import type { SessionState } from "./types";

export function assertSupportedSession(session: SessionState | null): asserts session is SessionState {
  if (!session) throw new SessionError("练习不存在。", 404);
  if (!isSupportedSession(session)) throw new SessionError("当前版本暂不支持编辑这份练习，可以查看已保存的内容。", 409, "unsupported_session");
}

export function sessionApiError(error: unknown) {
  if (error instanceof SessionError || error instanceof ModelError) return Response.json({ error: error.message, ...(error instanceof SessionError && error.code ? { code: error.code } : {}) }, { status: error.status, headers: { "Cache-Control": "no-store", ...(error instanceof ModelError && error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}) } });
  return apiError(error);
}
