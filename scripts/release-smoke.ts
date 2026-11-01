import "./load-env";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import { users, authSessions } from "../lib/db/schema";
import { markNewUserScanned } from "../lib/db/migrate-0.4";
import { readFeatures } from "../lib/config/features";

async function main() {
  if (!process.argv.includes("--allow-production")) throw new Error("Explicit --allow-production required for disposable deployment smoke account");
  const db = getDb(), id = `release-smoke-${randomUUID()}`, token = randomBytes(32).toString("hex"), now = new Date().toISOString();
  const base = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000", features = readFeatures();
  const steps: { path: string; status: number }[] = [];
  const call = async (path: string, method = "GET", body?: unknown) => {
    const response = await fetch(base + path, { method, redirect: "manual", headers: { cookie: `wm_session=${token}`, origin: process.env.APP_ORIGIN ?? base, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    steps.push({ path, status: response.status }); return response;
  };
  try {
  db.insert(users).values({ id, email: `${id}@example.invalid`, name: "发布临时验收", passwordHash: randomBytes(32).toString("hex"), createdAt: now, updatedAt: now }).run();
  db.insert(authSessions).values({ tokenHash: createHash("sha256").update(token).digest("hex"), userId: id, expiresAt: Date.now() + 600000 }).run();
  markNewUserScanned(db.$client, id, now);
    for (const path of ["/", "/essays", "/progress"]) assert.equal((await call(path)).status, 200);
    if (features.QUESTION_BANK_ENABLED) {
      for (const path of ["/api/topics", "/topics/health", "/cards"]) assert.equal((await call(path)).status, 200);
      if (features.QUICK_ENABLED) {
        const response = await call("/api/sessions", "POST", { questionId: "qb_mock_health_001", activity: "quick", mode: "practice", idempotencyKey: randomUUID() });
        assert.equal(response.status, 201);
        const attemptId = (await response.json()).session.id;
        assert.equal((await call(`/essays/${attemptId}`)).status, 200);
        assert.equal((await call(`/api/sessions/${attemptId}/actions`, "POST", { action: "cardSave", cardVersion: 0, parts: [{ key: "reasons.answer", text: "发布验收合成内容" }], requestId: randomUUID() })).status, 200);
        const current = await call(`/api/sessions/${attemptId}/quick`); assert.equal(current.status, 200);
        assert.equal((await current.json()).card.content.parts[0].text, "发布验收合成内容");
      }
      const checkpoint = await call("/api/checkpoints"); assert.equal(checkpoint.status, 200);
      assert.equal((await checkpoint.json()).enabled, features.CHECKPOINTS_ENABLED);
    }
    console.log(JSON.stringify({ passed: true, features, steps, modelCalls: 0 }));
  } finally {
    db.delete(users).where(eq(users.id, id)).run();
    assert.equal(db.select().from(users).where(eq(users.id, id)).get(), undefined);
    console.log(JSON.stringify({ disposableAccountRemoved: true }));
    db.$client.close();
  }
}
void main();
