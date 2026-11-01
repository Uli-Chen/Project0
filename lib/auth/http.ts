import "server-only";
import { z } from "zod";

export class AuthError extends Error {
  constructor(message = "请先登录，再继续操作。", public status = 401) {
    super(message);
    this.name = "AuthError";
  }
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  const expectedHost = request.headers.get("host") ?? requestUrl.host;
  const expectedOrigin = new URL(process.env.APP_ORIGIN || `${requestUrl.protocol}//${expectedHost}`).origin;
  // Trust the requested Host, not a caller-supplied forwarded host.
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AuthError("请求来源无效，请刷新页面后重试。", 403);
  }
  let originUrl: URL;
  try { originUrl = new URL(origin); } catch { throw new AuthError("请求来源无效。", 403); }
  if (originUrl.origin !== expectedOrigin || originUrl.username || originUrl.password || originUrl.pathname !== "/" || originUrl.search || originUrl.hash) {
    throw new AuthError("请求来源无效，请刷新页面后重试。", 403);
  }
}

export async function readJson(request: Request, maxBytes = 256_000): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new AuthError("请使用 JSON 格式提交。", 415);
  }
  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > maxBytes) throw new AuthError("提交内容过长，请缩短后重试。", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError("提交内容不能为空。", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    size += result.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new AuthError("提交内容过长，请缩短后重试。", 413);
    }
    chunks.push(result.value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new AuthError("提交内容无法读取，请重试。", 400); }
}

export function apiError(error: unknown) {
  if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message ?? "请检查填写的内容。" }, { status: 400 });
  console.error("Request failed:", error instanceof Error ? error.message : "Unknown error");
  return Response.json({ error: "服务暂时不可用，请稍后重试。" }, { status: 500 });
}
