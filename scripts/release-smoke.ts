import "./load-env";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import { users, authSessions, questions } from "../lib/db/schema";
import { markNewUserScanned } from "../lib/db/migrate-0.4";
import { readFeatures } from "../lib/config/features";
import { requirementSchema } from "../lib/question-bank/types";
import { cardSlots } from "../lib/quick/layouts";

async function main() {
  if (!process.argv.includes("--allow-production")) throw new Error("Explicit --allow-production required for disposable deployment smoke account");
  const db = getDb(), id = `release-smoke-${randomUUID()}`, token = randomBytes(32).toString("hex"), now = new Date().toISOString();
  const base = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000", features = readFeatures();
  const steps: { path: string; status: number }[] = [];
  const call = async (path: string, method = "GET", body?: unknown) => {
    const response = await fetch(base + path, { method, redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { cookie: `wm_session=${token}`, origin: process.env.APP_ORIGIN ?? base, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    steps.push({ path, status: response.status }); return response;
  };
  try {
    db.insert(users).values({ id, email: `${id}@example.invalid`, name: "发布临时验收", passwordHash: randomBytes(32).toString("hex"), createdAt: now, updatedAt: now }).run();
    db.insert(authSessions).values({ tokenHash: createHash("sha256").update(token).digest("hex"), userId: id, expiresAt: Date.now() + 600000 }).run();
    markNewUserScanned(db.$client, id, now);
    for (const path of ["/", "/progress"]) assert.equal((await call(path)).status, 200, path);
    const list = await call("/api/sessions?limit=1");
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), { sessions: [], nextCursor: null });
    assert.equal((await call("/essays")).status, features.QUESTION_BANK_ENABLED ? 307 : 200);
    if (features.QUESTION_BANK_ENABLED) {
      for (const path of ["/api/topics", "/practice?topic=health", "/cards"]) assert.equal((await call(path)).status, 200, path);
      const bank = db.select().from(questions).where(eq(questions.isCurrent, true)).orderBy(asc(questions.bankOrder)).all();
      const question = bank.find((q) => q.pool === "practice");
      assert.ok(question);
      const practice = await call("/practice?done=all");
      assert.equal(practice.status, 200);
      assert.ok((await practice.text()).includes(question.id));
      const ordinary = await call("/api/sessions", "POST", { kind: "free", mode: "mock", idempotencyKey: randomUUID() });
      assert.equal(ordinary.status, 201);
      const ordinaryPrompt = (await ordinary.json()).session.prompt;
      assert.ok(bank.some((q) => q.pool === "practice" && q.id === ordinaryPrompt.id && q.text === ordinaryPrompt.text));
      if (features.QUICK_ENABLED) {
        const response = await call("/api/sessions", "POST", { questionId: question.id, activity: "quick", mode: "practice", idempotencyKey: randomUUID() });
        assert.equal(response.status, 201);
        const session = (await response.json()).session;
        assert.equal(session.prompt.text, question.text);
        const attemptId = session.id;
        const [first] = cardSlots(requirementSchema.parse(JSON.parse(question.requirementsJson)));
        assert.equal((await call(`/essays/${attemptId}`)).status, 200);
        assert.equal((await call(`/api/sessions/${attemptId}/actions`, "POST", { action: "cardSave", cardVersion: 0, parts: [{ key: first.key, text: "发布验收合成内容" }], requestId: randomUUID() })).status, 200);
        const current = await call(`/api/sessions/${attemptId}/quick`); assert.equal(current.status, 200);
        assert.equal((await current.json()).card.content.parts[0].text, "发布验收合成内容");
      }
      const checkpoint = await call("/api/checkpoints"); assert.equal(checkpoint.status, 200);
      assert.equal((await checkpoint.json()).enabled, features.CHECKPOINTS_ENABLED);
      if (features.CHECKPOINTS_ENABLED) {
        const mock = await call("/api/checkpoints/start", "POST", { idempotencyKey: randomUUID() });
        assert.equal(mock.status, 200);
        const session = (await mock.json()).session;
        assert.ok(bank.some((q) => q.id === session.question.id && q.text === session.prompt.text));
        assert.equal((await call(`/essays/${session.id}`)).status, 200);
      }
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
