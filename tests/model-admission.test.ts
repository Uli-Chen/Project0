import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelError } from "../lib/llm/json";

const directory = mkdtempSync(join(tmpdir(), "writemind-admission-"));
const previousPath = process.env.DATABASE_PATH;
process.env.DATABASE_PATH = join(directory, "isolated.sqlite");
import { withModelAdmission, admitModelCall } from "../lib/llm/admission";
import { getDb } from "../lib/db/client";
after(() => { getDb().$client.close(); if (previousPath === undefined) delete process.env.DATABASE_PATH; else process.env.DATABASE_PATH = previousPath; rmSync(directory, { recursive: true, force: true }); });

test("one model workflow per user, released after completion and failure", async () => {
  await withModelAdmission("same-user", async () => {
    admitModelCall();
    // A second model step within this workflow reuses its admission.
    admitModelCall();
    await assert.rejects(withModelAdmission("same-user", async () => admitModelCall()), error => error instanceof ModelError && error.status === 429 && error.retryAfter === 5);
  });
  await assert.rejects(withModelAdmission("same-user", async () => { admitModelCall(); throw new Error("test failure"); }), /test failure/);
  await withModelAdmission("same-user", async () => admitModelCall());
});
test("global admission is capped at eight and all slots are released", async () => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const requests = Array.from({ length: 8 }, (_, index) => withModelAdmission(`parallel-${index}`, async () => { admitModelCall(); await held; }));
  try { await assert.rejects(withModelAdmission("ninth-user", async () => admitModelCall()), error => error instanceof ModelError && error.status === 429 && error.retryAfter === 15); }
  finally { release(); await Promise.all(requests); }
  await withModelAdmission("ninth-user", async () => admitModelCall());
});
test("rate limit counts paid workflows, not deterministic operations or additional model steps", async () => {
  for (let index = 0; index < 35; index++) await withModelAdmission("rate-user", async () => undefined);
  for (let index = 0; index < 30; index++) await withModelAdmission("rate-user", async () => { admitModelCall(); admitModelCall(); });
  await assert.rejects(withModelAdmission("rate-user", async () => admitModelCall()), error => error instanceof ModelError && error.status === 429 && error.retryAfter === 60);
  // A rate-limited request must not acquire a global/per-user slot.
  await withModelAdmission("different-rate-user", async () => admitModelCall());
});
