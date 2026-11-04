import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Developer-only access to the unreleased marketing page at /preview.
// The password is never stored in the repository: the server keeps only its
// scrypt hash (PREVIEW_PASSWORD_HASH) and a signing secret
// (PREVIEW_SESSION_SECRET) in .env.local. Without both, access stays closed.

export const PREVIEW_COOKIE = "p0_preview";
export const PREVIEW_MAX_AGE = 60 * 60 * 24 * 7;

type Env = Record<string, string | undefined>;
type PreviewConfig = { hash: string; secret: string };

export function readPreviewConfig(env: Env = process.env): PreviewConfig | null {
  const hash = env.PREVIEW_PASSWORD_HASH?.trim();
  const secret = env.PREVIEW_SESSION_SECRET?.trim();
  if (!hash || !/^scrypt-v1:[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash)) return null;
  if (!secret || secret.length < 32) return null;
  return { hash, secret };
}

// Binding the signature to the password hash means rotating the password
// signs every developer out.
function sign(expiresAt: number, config: PreviewConfig) {
  const passwordId = createHash("sha256").update(config.hash).digest("hex");
  return createHmac("sha256", config.secret).update(`p0-preview:v1:${expiresAt}:${passwordId}`).digest("base64url");
}

export function createPreviewToken(config: PreviewConfig, now = Date.now()) {
  const expiresAt = now + PREVIEW_MAX_AGE * 1000;
  return `${expiresAt}.${sign(expiresAt, config)}`;
}

export function hasPreviewAccess(token: string | undefined, config: PreviewConfig | null = readPreviewConfig(), now = Date.now()) {
  if (!config || !token) return false;
  const match = /^(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  if (expiresAt <= now || expiresAt > now + PREVIEW_MAX_AGE * 1000) return false;
  const expected = Buffer.from(sign(expiresAt, config));
  const actual = Buffer.from(match[2]);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Nginx appends the connecting address as the last X-Forwarded-For entry;
// earlier entries are supplied by the client and cannot be trusted.
export function clientAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").map(part => part.trim()).filter(Boolean);
  return forwarded?.at(-1) ?? "local";
}

export function previewCookieOptions(maxAge = PREVIEW_MAX_AGE) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge };
}
