import "server-only";
import { apiError } from "@/lib/auth/http";
import { ModelError } from "@/lib/llm/json";
import { SessionError } from "./engine";
export function sessionApiError(error: unknown) {
  if (error instanceof SessionError || error instanceof ModelError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store", ...(error instanceof ModelError && error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}) } });
  return apiError(error);
}
