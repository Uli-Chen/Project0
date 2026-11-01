import { inRequest } from "./helpers/request-context";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "../lib/db/client";
import { authSessions, users, legacyScan, completionEvents } from "../lib/db/schema";
import { getSession, listSessions, saveSession } from "../lib/db/queries/sessions";
import { importQuestions } from "../lib/db/import-questions";
import { markNewUserScanned } from "../lib/db/migrate-0.4";
import { commitPracticeCheckpoint } from "../lib/db/practice-facts";
import { runAction, SessionError } from "../lib/pipeline/engine";
import { POST } from "../app/api/sessions/[id]/actions/route";
import { GET, PATCH, DELETE } from "../app/api/sessions/[id]/route";
import { POST as LIFECYCLE } from "../app/api/sessions/[id]/lifecycle/route";
import { POST as REGISTER } from "../app/api/auth/register/route";
import { register } from "../instrumentation";
import { catalog, requirements, session, evaluation, time, table } from "./helpers/practice-db";

const directory = mkdtempSync(join(tmpdir(), "opc-practice-api-"));
process.env.DATABASE_PATH = join(directory, "test.db");
process.env.APP_ORIGIN = "http://practice.test";
const db = getDb(); migrate(db, { migrationsFolder: resolve("drizzle") });
importQuestions(db.$client, catalog, requirements);
const token = "a".repeat(64);
db.insert(users).values({ id: "u", email: "api@test.test", name: "Test", passwordHash: "test", createdAt: time, updatedAt: time }).run();
db.insert(authSessions).values({ tokenHash: createHash("sha256").update(token).digest("hex"), userId: "u", expiresAt: Date.now() + 3600000 }).run();
markNewUserScanned(db.$client, "u", time);
after(() => { db.$client.close(); rmSync(directory, { recursive: true, force: true }); });
async function call(id: string, method: "GET" | "PATCH" | "POST" | "DELETE", body?: unknown) {
  const request = new Request(`http://practice.test/api/sessions/${id}`, { method,
    headers: { origin: "http://practice.test", cookie: `wm_session=${token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return inRequest(request, () => ({ GET, PATCH, POST, DELETE })[method](request, { params: Promise.resolve({ id }) }));
}
const modelResponse = (value: unknown) => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] });
const events = () => db.select().from(completionEvents).all();
async function mock<T>(fetcher: typeof fetch, work: () => Promise<T>) {
  const original = globalThis.fetch, key = process.env.LLM_API_KEY;
  process.env.LLM_API_KEY = "offline-only"; globalThis.fetch = fetcher;
  try { return await work(); }
  finally { globalThis.fetch = original; if (key === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = key; }
}

async function failedReview() {
  const s = session(true); saveSession("u", s);
  let calls = 0;
  const response = await mock(async () => ++calls === 1 ? modelResponse(evaluation) : new Response("fail", { status: 503 }), () => call(s.id, "POST", { action: "evaluate", kind: "original", requestId: crypto.randomUUID() }));
  assert.equal(response.status, 200);
  const saved = (await response.json()).session;
  assert.equal(saved.stage, "feedback"); assert.equal(saved.reviewStatus, "failed"); assert.equal(saved.evalError, null);
  assert.equal(saved.pendingAction, null); assert.ok(saved.completedAt); assert.ok(saved.originalSubmittedAt);
  return saved;
}

test("Required feedback API commit is visible before optional call; projection overrides stale JSON and lost response replay calls no model", async () => {
  const s = session(true); saveSession("u", s);
  const requestId = crypto.randomUUID(); let calls = 0;
  await mock(async (_url, init) => {
    calls++;
    if (calls === 1) {
      const messages = JSON.parse(init!.body as string).messages;
      assert.ok(JSON.stringify(messages).includes("Evaluate ONLY the supplied essay and task"));
      assert.ok(getSession("u", s.id)!.originalSubmittedAt, "acceptance precedes model call");
      return modelResponse(evaluation);
    }
    const interim = getSession("u", s.id)!;
    assert.equal(interim.stage, "feedback"); assert.ok(interim.completedAt); assert.equal(interim.reviewStatus, "pending");
    assert.equal(events().filter(e => e.attemptId === s.id).length, 1);
    return new Response("unavailable", { status: 503 });
  }, async () => {
    const response = await call(s.id, "POST", { action: "evaluate", kind: "original", requestId });
    assert.equal(response.status, 200); // Deliberately ignore response body, like a lost response.
  });
  const before = events();
  await mock(async () => { assert.fail("replaying a completed request must not call model"); }, async () => {
    const response = await call(s.id, "POST", { action: "evaluate", kind: "original", requestId });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).session.reviewStatus, "failed");
  });
  assert.deepEqual(events(), before);
  const saved = getSession("u", s.id)!;
  const completed = saved.completedAt;
  saved.completedAt = "1900-01-01T00:00:00Z"; saveSession("u", saved);
  assert.equal(getSession("u", s.id)!.completedAt, completed);
  assert.equal(listSessions("u").find(row => row.id === s.id)!.completedAt, completed);
  assert.equal((await (await call(s.id, "GET")).json()).session.completedAt, completed);
  assert.equal(getSession("other", s.id), null);
});

test("original evaluate rejects feedback/compared/finished with 409, no model call and byte-for-byte unchanged records", async () => {
  let calls = 0;
  await mock(async () => { calls++; assert.fail("rejected original evaluation must not call model"); }, async () => {
    for (const stage of ["feedback", "compared", "finished"] as const) {
      const s = session(); saveSession("u", s);
      s.submitted.original = s.drafts.original; s.stage = "evaluating";
      commitPracticeCheckpoint(db.$client, "u", s, "acceptOriginal", state => saveSession("u", state), time);
      s.stage = "feedback"; s.evaluation = structuredClone(evaluation);
      commitPracticeCheckpoint(db.$client, "u", s, "completeOriginal", state => saveSession("u", state), time);
      if (stage !== "feedback") {
        s.submitted.revision = s.drafts.original + " Students can use the savings to buy textbooks.";
        s.revisionScores = structuredClone(evaluation.scores);
        s.comparison = { issues: [{ rank: 1, status: "resolved", reason: "解释了节省开支的用途", revisionSentenceIds: [6] }], idea: { stanceKept: true, keptPoints: ["支持公共交通"], deepened: [], changed: [] }, aiRatio: 0 };
      }
      if (stage === "finished") s.finish = { memoryChanges: [{ kind: "improving", text: "例子包含具体后果" }] };
      s.stage = stage; saveSession("u", s);
      const before = structuredClone(s);
      const snapshot = () => ["writing_sessions", "attempt_markers", "completion_events", "familiarity", "legacy_scan", "default_continuations", "request_receipts"].map(name => table(db.$client, name));
      const records = snapshot();
      await assert.rejects(runAction(s, { action: "evaluate", kind: "original" }, () => assert.fail("stage rejection must precede checkpoints")), error => {
        assert.ok(error instanceof SessionError); assert.equal(error.status, 409); assert.match(error.message, /当前阶段不能执行/); return true;
      });
      const response = await call(s.id, "POST", { action: "evaluate", kind: "original", requestId: crypto.randomUUID() });
      assert.equal(response.status, 409, stage);
      assert.match((await response.json()).error, /当前阶段不能执行/);
      assert.equal(calls, 0, stage);
      assert.deepEqual(s, before);
      assert.deepEqual(getSession("u", s.id), before);
      assert.deepEqual(snapshot(), records, stage);
    }
  });
});

test("optional review retry releases its lock during model call, preserves concurrent saves, and never repeats scoring or completion", async () => {
  const saved = await failedReview(), before = events();
  let release!: () => void, entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  await mock(async (_url, init) => {
    calls++; assert.ok((init!.body as string).includes("Review how the student"));
    assert.equal(db.$client.inTransaction, false, "model call outside SQLite transaction");
    entered(); await gate; return modelResponse(evaluation.review);
  }, async () => {
    const pending = call(saved.id, "POST", { action: "retryReview", requestId: crypto.randomUUID() });
    try {
      await ready;
      const current = getSession("u", saved.id)!;
      assert.equal((await (await call(saved.id, "GET")).json()).busy, true);
      assert.equal((await call(saved.id, "POST", { action: "retryReview", requestId: crypto.randomUUID() })).status, 409);
      assert.equal((await call(saved.id, "PATCH", { version: current.version, nudgesEnabled: false })).status, 200);
    } finally { release(); }
    const response = await pending; assert.equal(response.status, 200);
    const updated = (await response.json()).session;
    assert.equal(updated.reviewStatus, "ok"); assert.equal(updated.nudgesEnabled, false);
    assert.equal(updated.completedAt, saved.completedAt); assert.equal(updated.feedbackUpdatedAt, null);
    assert.deepEqual(updated.evaluation.scores, saved.evaluation.scores);
  });
  assert.equal(calls, 1); assert.deepEqual(events(), before);
});

test("deleting an attempt during optional review retry never recreates content or changes completion", async () => {
  const saved = await failedReview(), before = events();
  await mock(async () => {
    assert.equal((await call(saved.id, "DELETE")).status, 200);
    return modelResponse(evaluation.review);
  }, async () => {
    const response = await call(saved.id, "POST", { action: "retryReview", requestId: crypto.randomUUID() });
    assert.equal(response.status, 404);
  });
  assert.equal(getSession("u", saved.id), null); assert.deepEqual(events(), before.map(e => e.attemptId === saved.id ? { ...e, evidenceDeleted: true } : e));
});

test("interrupted optional review is a read-only failed projection and retries only review", async () => {
  const saved = await failedReview();
  saved.reviewStatus = "pending";
  saved.pendingAction = { requestId: crypto.randomUUID(), input: { action: "evaluate", kind: "original" }, startedAt: time };
  saveSession("u", saved);
  const raw = () => db.$client.prepare("SELECT state_json FROM writing_sessions WHERE id=?").get(saved.id);
  const before = raw(), completion = events();
  const response = await call(saved.id, "GET");
  const shown = (await response.json()).session;
  assert.equal(shown.reviewStatus, "failed"); assert.equal(shown.pendingAction, null); assert.equal(shown.stage, "feedback");
  assert.deepEqual(raw(), before);
  let calls = 0;
  await mock(async () => { calls++; return modelResponse(evaluation.review); }, async () => {
    assert.equal((await call(saved.id, "POST", { action: "retryReview", requestId: crypto.randomUUID() })).status, 200);
  });
  assert.equal(calls, 1); assert.deepEqual(events(), completion);
});

test("registration atomically writes legacy_scan unresolved_count=0; scan write failure rolls back the user", async () => {
  const enabled = process.env.REGISTRATION_ENABLED; process.env.REGISTRATION_ENABLED = "true";
  const create = (email: string) => {
    const request = new Request("http://practice.test/api/auth/register", { method: "POST", headers: { origin: "http://practice.test", "content-type": "application/json" }, body: JSON.stringify({ email, name: "New", password: "offline-password-123" }) });
    return inRequest(request, () => REGISTER(request));
  };
  try {
    const response = await create("registered@test.test"); assert.equal(response.status, 201);
    const id = (await response.json()).user.id;
    const scan = db.select().from(legacyScan).all().find(s => s.userId === id)!;
    assert.equal(scan.unresolvedCount, 0);
    db.$client.exec("CREATE TRIGGER fail_new_scan BEFORE INSERT ON legacy_scan BEGIN SELECT RAISE(ABORT, 'test scan write failure'); END");
    assert.equal((await create("rolled-back@test.test")).status, 500);
    assert.equal(db.select().from(users).all().some(u => u.email === "rolled-back@test.test"), false);
  } finally {
    db.$client.exec("DROP TRIGGER IF EXISTS fail_new_scan");
    if (enabled === undefined) delete process.env.REGISTRATION_ENABLED; else process.env.REGISTRATION_ENABLED = enabled;
  }
});

test("startup hook logs scan failure and returns; missing scan remains absent for conservative exposure checks", async () => {
  const runtime = process.env.NEXT_RUNTIME, original = console.error;
  const errors: unknown[] = []; console.error = (...args) => { errors.push(args); };
  process.env.NEXT_RUNTIME = "nodejs";
  db.insert(users).values({ id: "malformed", email: "malformed@test.test", name: "Bad", passwordHash: "test", createdAt: time, updatedAt: time }).run();
  db.$client.prepare("INSERT INTO writing_sessions VALUES(?,?,?,?,?)").run("malformed", "malformed", "{bad", time, time);
  try {
    await register();
    assert.equal(errors.length, 1);
    assert.equal(db.select().from(legacyScan).all().some(s => s.userId === "malformed"), false);
  } finally { console.error = original; if (runtime === undefined) delete process.env.NEXT_RUNTIME; else process.env.NEXT_RUNTIME = runtime; }
});


test("student review retry stamps recency before calling model; automatic review completion preserves later lifecycle time and state", async () => {
  const saved = await failedReview(); saved.lastStudentActionAt = time; saveSession("u", saved);
  let laterTime: string | null = null;
  await mock(async () => {
    const reserved = getSession("u", saved.id)!;
    assert.notEqual(reserved.lastStudentActionAt, time);
    const request = new Request(`http://practice.test/api/sessions/${saved.id}/lifecycle`, { method: "POST", headers: { origin: "http://practice.test", cookie: `wm_session=${token}`, "content-type": "application/json" }, body: JSON.stringify({ action: "setAside" }) });
    const response = await inRequest(request, () => LIFECYCLE(request, { params: Promise.resolve({ id: saved.id }) }));
    assert.equal(response.status, 200);
    laterTime = (await response.json()).session.lastStudentActionAt;
    return modelResponse(evaluation.review);
  }, async () => {
    const response = await call(saved.id, "POST", { action: "retryReview", requestId: crypto.randomUUID() });
    assert.equal(response.status, 200);
    const result = (await response.json()).session;
    assert.equal(result.lastStudentActionAt, laterTime);
    assert.equal(result.lifecycle, "set_aside"); assert.equal(result.stage, "feedback");
    assert.equal(result.completedAt, saved.completedAt);
  });
});

test("automatic paragraph nudge updates its result without changing latest student action time", async () => {
  const s = session(); s.lastStudentActionAt = time; saveSession("u", s);
  await mock(async () => modelResponse({ message: "这个例子怎样支持你的观点？", code: "example" }), async () => {
    const response = await call(s.id, "POST", { action: "nudge", kind: "original", paragraphIndex: 0 });
    assert.equal(response.status, 200);
    const result = (await response.json()).session;
    assert.ok(result.nudge); assert.equal(result.lastStudentActionAt, time);
  });
});
