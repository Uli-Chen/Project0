import assert from "node:assert/strict";
import { test } from "node:test";
import { clientAddress, createPreviewToken, hasPreviewAccess, PREVIEW_MAX_AGE, readPreviewConfig } from "../lib/preview/access";

const hash = `scrypt-v1:${"a".repeat(32)}:${"b".repeat(128)}`;
const secret = "s".repeat(43);
const config = readPreviewConfig({ PREVIEW_PASSWORD_HASH: hash, PREVIEW_SESSION_SECRET: secret })!;

test("preview access stays closed unless both hash and secret are valid", () => {
  assert.equal(readPreviewConfig({}), null);
  assert.equal(readPreviewConfig({ PREVIEW_PASSWORD_HASH: hash }), null);
  assert.equal(readPreviewConfig({ PREVIEW_PASSWORD_HASH: hash, PREVIEW_SESSION_SECRET: "short" }), null);
  assert.equal(readPreviewConfig({ PREVIEW_PASSWORD_HASH: "plain-password", PREVIEW_SESSION_SECRET: secret }), null);
  assert.ok(config);
  assert.equal(hasPreviewAccess(createPreviewToken(config), null), false);
});

test("preview tokens verify, expire and break when the password changes", () => {
  const now = 1_800_000_000_000;
  const token = createPreviewToken(config, now);
  assert.equal(hasPreviewAccess(token, config, now + 1000), true);
  assert.equal(hasPreviewAccess(token, config, now + PREVIEW_MAX_AGE * 1000), false);
  const rotated = readPreviewConfig({ PREVIEW_PASSWORD_HASH: `scrypt-v1:${"c".repeat(32)}:${"b".repeat(128)}`, PREVIEW_SESSION_SECRET: secret })!;
  assert.equal(hasPreviewAccess(token, rotated, now + 1000), false);
  const otherSecret = readPreviewConfig({ PREVIEW_PASSWORD_HASH: hash, PREVIEW_SESSION_SECRET: "t".repeat(43) })!;
  assert.equal(hasPreviewAccess(token, otherSecret, now + 1000), false);
});

test("forged or malformed preview tokens are rejected", () => {
  const now = 1_800_000_000_000;
  const [expiresAt, signature] = createPreviewToken(config, now).split(".");
  const flipped = signature.slice(0, -1) + (signature.endsWith("A") ? "B" : "A");
  for (const token of [undefined, "", "x", `${expiresAt}.${flipped}`, `${Number(expiresAt) + 1}.${signature}`, `${expiresAt}.${signature}x`, `${now + 10 * PREVIEW_MAX_AGE * 1000}.${signature}`]) {
    assert.equal(hasPreviewAccess(token, config, now), false);
  }
});

test("rate-limit key uses the address nginx appended, not client-supplied entries", () => {
  assert.equal(clientAddress(new Request("http://x", { headers: { "x-forwarded-for": "1.1.1.1, 203.0.113.9" } })), "203.0.113.9");
  assert.equal(clientAddress(new Request("http://x")), "local");
});
