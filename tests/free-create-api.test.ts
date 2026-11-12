import { inRequest } from "./helpers/request-context";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "../lib/db/client";
import { markNewUserScanned } from "../lib/db/migrate-0.4";
import { POST as CREATE } from "../app/api/sessions/route";
import { DELETE } from "../app/api/sessions/[id]/route";
import { time, table } from "./helpers/practice-db";

// Free practice (pasted prompt, topic, suggested) and plain mocks get the same creation receipt as
// question-bank practice: a retried request with the same intent key returns the essay already made.
const directory = mkdtempSync(join(tmpdir(), "opc-free-create-"));
process.env.DATABASE_PATH = join(directory, "test.db");
process.env.APP_ORIGIN = "http://free.test";
const db = getDb(); migrate(db, { migrationsFolder: resolve("drizzle") });
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
for (const id of ["u", "other"]) {
  db.$client.prepare("INSERT INTO users(id,email,name,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)").run(id, `${id}@free.test`, id, "test", time, time);
  db.$client.prepare("INSERT INTO auth_sessions VALUES(?,?,?)").run(digest(digest(id)), id, Date.now() + 3600000);
  markNewUserScanned(db.$client, id, time);
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Network forbidden in free-create API tests"); };
after(() => { globalThis.fetch = originalFetch; db.$client.close(); rmSync(directory, { recursive: true, force: true }); });

async function create(body: unknown, user = "u") {
  const request = new Request("http://free.test/api/sessions", { method: "POST", headers: { origin: "http://free.test", cookie: `wm_session=${digest(user)}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const response = await inRequest(request, () => CREATE(request));
  return { status: response.status, body: await response.json() };
}
async function remove(id: string) {
  const request = new Request(`http://free.test/api/sessions/${id}`, { method: "DELETE", headers: { origin: "http://free.test", cookie: `wm_session=${digest("u")}` } });
  return inRequest(request, () => DELETE(request, { params: Promise.resolve({ id }) }));
}
const pasted = "Some people think that university education should be free for everyone. To what extent do you agree?";

test("粘贴题目：同一创建意图并发或重试只建一篇，返回同一份练习；参数不同 409；不同用户互不影响", async () => {
  const body = { kind: "free", mode: "practice", prompt: pasted, idempotencyKey: crypto.randomUUID() };
  const count = table(db.$client, "writing_sessions").length;
  const results = await Promise.all(Array.from({ length: 6 }, () => create(body)));
  assert.equal(results.filter(r => r.status === 201).length, 1, JSON.stringify(results.map(r => r.body)));
  assert.equal(results.filter(r => r.status === 200).length, 5);
  assert.equal(new Set(results.map(r => r.body.session.id)).size, 1);
  assert.equal(results[0].body.session.prompt.text, pasted);
  assert.equal(table(db.$client, "writing_sessions").length, count + 1);
  const conflict = await create({ ...body, prompt: `${pasted} Discuss.` });
  assert.equal(conflict.status, 409); assert.equal(conflict.body.code, "idempotency_conflict");
  const other = await create(body, "other");
  assert.equal(other.status, 201); assert.notEqual(other.body.session.id, results[0].body.session.id);
});

test("普通模考和随机题：重试返回同一题同一篇，而不是再抽一道", async () => {
  const mock = { kind: "free", mode: "mock", idempotencyKey: crypto.randomUUID() };
  const first = await create(mock);
  assert.equal(first.status, 201); assert.equal(first.body.session.mode, "mock");
  const retry = await create(mock);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.session.id, first.body.session.id);
  assert.equal(retry.body.session.prompt.text, first.body.session.prompt.text);
  const practice = await create({ ...mock, mode: "practice" });
  assert.equal(practice.status, 409, "the same key with a different choice is a conflict, not a second essay");
  const fresh = await create({ ...mock, idempotencyKey: crypto.randomUUID() });
  assert.equal(fresh.status, 201); assert.notEqual(fresh.body.session.id, first.body.session.id);
});

test("已删除的练习不会因为重试被重新创建；没有创建意图的旧页面请求照常创建", async () => {
  const body = { kind: "free", mode: "practice", prompt: pasted, idempotencyKey: crypto.randomUUID() };
  const first = await create(body);
  assert.equal((await remove(first.body.session.id)).status, 200);
  const retry = await create(body);
  assert.equal(retry.status, 409); assert.equal(retry.body.code, "practice_deleted");
  const legacy = [await create({ kind: "free", mode: "practice", prompt: pasted }), await create({ kind: "free", mode: "practice", prompt: pasted })];
  assert.deepEqual(legacy.map(r => r.status), [201, 201]);
  assert.equal((await create({ ...body, idempotencyKey: "" })).status, 400);
});
