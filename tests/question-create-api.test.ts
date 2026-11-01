import { inRequest } from "./helpers/request-context";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "../lib/db/client";
import { getSession, saveSession } from "../lib/db/queries/sessions";
import { importQuestions } from "../lib/db/import-questions";
import { markNewUserScanned } from "../lib/db/migrate-0.4";
import { commitPracticeCheckpoint } from "../lib/db/practice-facts";
import { hashPassword } from "../lib/auth/password";
import { limitAuth } from "../lib/auth/rate-limit";
import { POST as CREATE, GET as LIST } from "../app/api/sessions/route";
import { GET, PATCH, DELETE } from "../app/api/sessions/[id]/route";
import { POST as ACTION } from "../app/api/sessions/[id]/actions/route";
import { POST as LIFECYCLE } from "../app/api/sessions/[id]/lifecycle/route";
import { DELETE as ACCOUNT } from "../app/api/auth/account/route";
import { catalog, requirements, evaluation, time, table } from "./helpers/practice-db";
import type { SessionState } from "../lib/pipeline/types";

const directory = mkdtempSync(join(tmpdir(), "opc-wp2c-api-"));
process.env.DATABASE_PATH = join(directory, "test.db");
process.env.APP_ORIGIN = "http://wp2c.test";
process.env.QUESTION_BANK_ENABLED = "true";
const db = getDb(); migrate(db, { migrationsFolder: resolve("drizzle") });
importQuestions(db.$client, catalog, requirements);
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
for (const id of ["u", "other"]) {
  db.$client.prepare("INSERT INTO users(id,email,name,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)").run(id, `${id}@wp2c.test`, id, "test", time, time);
  db.$client.prepare("INSERT INTO auth_sessions VALUES(?,?,?)").run(digest(digest(id)), id, Date.now() + 3600000);
  markNewUserScanned(db.$client, id, time);
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Network forbidden in WP2c API tests"); };
after(() => { globalThis.fetch = originalFetch; db.$client.close(); rmSync(directory, { recursive: true, force: true }); });
async function call(endpoint: "create" | "list" | "action" | "lifecycle" | "session" | "account", method: string, body?: unknown, id = "", user = "u", origin = "http://wp2c.test") {
  const request = new Request(`http://wp2c.test/api/${endpoint === "account" ? "auth/account" : `sessions/${id}`}`, { method,
    headers: { origin, cookie: `wm_session=${digest(user)}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const response = await inRequest(request, () => {
    if (endpoint === "create") return CREATE(request);
    if (endpoint === "list") return LIST();
    if (endpoint === "account") return ACCOUNT(request);
    const handler = endpoint === "action" ? ACTION : endpoint === "lifecycle" ? LIFECYCLE : method === "GET" ? GET : method === "PATCH" ? PATCH : DELETE;
    return handler(request, { params: Promise.resolve({ id }) });
  });
  return { status: response.status, body: await response.json() };
}
const input = (extra: Record<string, unknown> = {}) => ({ questionId: catalog.questions[0].id, activity: "deep", mode: "practice", idempotencyKey: crypto.randomUUID(), ...extra });
async function create(extra: Record<string, unknown> = {}, user = "u"): Promise<SessionState> {
  const r = await call("create", "POST", input(extra), "", user); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body.session;
}
function completed(s: SessionState, user = "u") {
  s.stage = "evaluating"; s.submitted.original = "An original.";
  commitPracticeCheckpoint(db.$client, user, s, "acceptOriginal", state => saveSession(user, state), time);
  s.stage = "feedback"; s.evaluation = structuredClone(evaluation);
  commitPracticeCheckpoint(db.$client, user, s, "completeOriginal", state => saveSession(user, state), time);
}
const records = () => ["writing_sessions", "attempt_markers", "completion_events", "familiarity", "request_receipts"].map(t => table(db.$client, t));

test("same idempotencyKey concurrent/repeated creates one session, same parameters with reordered keys replay 200; changed parameters 409; users isolated", async () => {
  const body = input(), count = table(db.$client, "writing_sessions").length;
  const results = await Promise.all(Array.from({ length: 8 }, () => call("create", "POST", body)));
  assert.equal(results.filter(r => r.status === 201).length, 1);
  assert.equal(results.filter(r => r.status === 200).length, 7);
  assert.equal(new Set(results.map(r => r.body.session.id)).size, 1);
  assert.equal(table(db.$client, "writing_sessions").length, count + 1);
  assert.equal((await call("create", "POST", Object.fromEntries(Object.entries(body).reverse()))).status, 200);
  for (const extra of [{ questionId: catalog.questions[1].id }, { activity: "quick" }, { mode: "mock" }, { rewriteOfDeepId: "unknown" }]) {
    const r = await call("create", "POST", { ...body, ...extra }); assert.equal(r.status, "activity" in extra ? 403 : 409);
    assert.equal(r.body.code, "activity" in extra ? "feature_disabled" : "mode" in extra ? "mock_requires_checkpoint" : "idempotency_conflict");
  }
  const other = await call("create", "POST", body, "", "other"); assert.equal(other.status, 201);
  assert.notEqual(other.body.session.id, results[0].body.session.id);
});

test("current question snapshot is frozen across v2 import/current switch; new attempts use v2; missing/noncurrent question 404; reserved allowed", async () => {
  const s = await create(), frozen = structuredClone(s.question);
  assert.equal(s.prompt.text, frozen!.text); assert.equal(s.prompt.id, frozen!.id); assert.equal(s.prompt.questionType, frozen!.questionType);
  assert.equal(Object.keys(frozen!).length, 7);
  const v2 = structuredClone(catalog), req2 = structuredClone(requirements);
  v2.bankVersion = "wp2c-v2"; v2.questions[0].version = 2; v2.questions[0].text += " Give reasons for your answer.";
  req2.find((r: { id: string }) => r.id === s.question!.id).version = 2;
  importQuestions(db.$client, v2, req2);
  assert.deepEqual(getSession("u", s.id)!.question, frozen);
  assert.equal((await create()).question!.version, 2);
  assert.equal((await call("create", "POST", input({ questionId: "missing" }))).status, 404);
  const q = catalog.questions[2]; db.$client.prepare("UPDATE questions SET is_current=0 WHERE id=?").run(q.id);
  assert.equal((await call("create", "POST", input({ questionId: q.id }))).status, 404);
  db.$client.prepare("UPDATE questions SET is_current=1 WHERE id=?").run(q.id);
  assert.ok((await create({ questionId: catalog.questions.find((q: { pool: string }) => q.pool === "checkpoint_reserved").id })).question);
});

test("rewriteOfDeepId: owned same family accepted, other user/missing 404, different family/non-deep 409; deleted source marker still supports blank rewrite", async () => {
  const source = await create();
  assert.equal((await create({ rewriteOfDeepId: source.id })).rewriteOfDeepId, source.id);
  const other = await create({}, "other"), different = await create({ questionId: catalog.questions[1].id });
  for (const id of [other.id, "missing"]) assert.equal((await call("create", "POST", input({ rewriteOfDeepId: id }))).status, 404);
  for (const id of [different.id, source.id]) {
    if (id === source.id) { source.activity = "quick"; saveSession("u", source); }
    const r = await call("create", "POST", input({ rewriteOfDeepId: id })); assert.equal(r.status, 409); assert.equal(r.body.code, "invalid_rewrite");
  }
  source.activity = "deep"; saveSession("u", source);
  assert.equal((await call("session", "DELETE", undefined, source.id)).status, 200);
  const rewrite = await create({ rewriteOfDeepId: source.id }); assert.equal(rewrite.drafts.original, "");
});

test("lifecycle all transitions and same-state idempotence preserve stage, completion and family facts; owner/origin/auth/unsupported guards", async () => {
  const s = await create(); completed(s);
  const facts = ["completion_events", "familiarity", "attempt_markers"].map(t => table(db.$client, t));
  for (const [action, expected] of [["setAside", "set_aside"], ["resume", "open"], ["close", "closed"], ["resume", "open"], ["setAside", "set_aside"], ["close", "closed"]]) {
    const r = await call("lifecycle", "POST", { action }, s.id); assert.equal(r.status, 200); assert.equal(r.body.session.lifecycle, expected);
    assert.equal(r.body.session.stage, "feedback"); assert.ok(r.body.session.lastStudentActionAt);
    assert.deepEqual((await call("lifecycle", "POST", { action }, s.id)).body, r.body);
  }
  assert.equal((await call("lifecycle", "POST", { action: "setAside" }, s.id)).status, 409);
  assert.deepEqual(["completion_events", "familiarity", "attempt_markers"].map(t => table(db.$client, t)), facts);
  assert.equal((await call("lifecycle", "POST", { action: "resume" }, s.id, "other")).status, 404);
  assert.equal((await call("lifecycle", "POST", { action: "resume" }, s.id, "none")).status, 401);
  assert.equal((await call("lifecycle", "POST", { action: "resume" }, s.id, "u", "http://evil.test")).status, 403);
  for (const change of [{ activity: "quick" }, { stage: "future" }]) {
    saveSession("u", { ...s, ...change } as SessionState);
    const before = records(), r = await call("lifecycle", "POST", { action: "resume" }, s.id);
    assert.equal(r.status, 409); assert.equal(r.body.code, "unsupported_session"); assert.deepEqual(records(), before);
  }
});

test("lastStudentActionAt changes on real draft/outline edits and actions, never GET/list, identical PATCH, timer/preferences, ignored draft or replay", async () => {
  const s = await create(); s.lastStudentActionAt = time; saveSession("u", s);
  const unchanged = async (endpoint: "session" | "list", method: string, body?: unknown) => {
    const r = await call(endpoint, method, body, s.id); assert.equal(r.status, 200); assert.equal(getSession("u", s.id)!.lastStudentActionAt, time);
  };
  await unchanged("session", "GET"); await unchanged("list", "GET");
  await unchanged("session", "PATCH", { version: s.version, drafts: s.drafts, outline: s.outline, elapsed: { original: 5, revision: 0 }, nudgesEnabled: false });
  const outline = structuredClone(s.outline); outline.stance = { text: "My position", sources: ["student"] };
  for (const edit of [{ drafts: { original: "Actual draft", revision: "" } }, { outline }]) {
    const current = getSession("u", s.id)!; current.lastStudentActionAt = time; saveSession("u", current);
    const r = await call("session", "PATCH", { version: current.version, ...edit }, s.id); assert.equal(r.status, 200); assert.notEqual(r.body.session.lastStudentActionAt, time);
  }
  const requestId = crypto.randomUUID();
  const current = getSession("u", s.id)!; current.lastStudentActionAt = time; saveSession("u", current);
  const r = await call("action", "POST", { action: "startWriting", requestId }, s.id); assert.equal(r.status, 200); assert.notEqual(r.body.session.lastStudentActionAt, time);
  assert.deepEqual((await call("action", "POST", { action: "startWriting", requestId }, s.id)).body, r.body);
  current.stage = "feedback"; current.lastStudentActionAt = time; saveSession("u", current);
  await unchanged("session", "PATCH", { version: current.version, drafts: { original: "Ignored after submission", revision: "" } });
});

test("deleting completed practice retains exposure/completion with deleted evidence; resubmission is repeat, receipt cannot resurrect; transactional deletion rollback", async () => {
  const body = input(), r = await call("create", "POST", body), s: SessionState = r.body.session; completed(s);
  const before = records();
  db.$client.exec("CREATE TRIGGER fail_delete BEFORE DELETE ON writing_sessions BEGIN SELECT RAISE(ABORT, 'injected delete failure'); END");
  const log = console.error; console.error = () => {};
  try { assert.equal((await call("session", "DELETE", undefined, s.id)).status, 500); assert.deepEqual(records(), before); }
  finally { console.error = log; db.$client.exec("DROP TRIGGER fail_delete"); }
  assert.equal((await call("session", "DELETE", undefined, s.id, "other")).status, 404);
  assert.equal((await call("session", "DELETE", undefined, s.id)).status, 200);
  assert.equal(getSession("u", s.id), null);
  assert.ok(table(db.$client, "attempt_markers").find(m => m.attempt_id === s.id)!.deleted_at);
  const event = table(db.$client, "completion_events").find(e => e.attempt_id === s.id)!;
  assert.equal(event.evidence_deleted, 1); assert.equal(event.completed_at, time);
  assert.ok(table(db.$client, "familiarity").find(f => f.exposure_key === s.question!.exposureKey));
  const replay = await call("create", "POST", body); assert.equal(replay.status, 409); assert.equal(replay.body.code, "practice_deleted");
  const next = await create(); completed(next); assert.equal(next.originalFreshness, "repeat");
});

test("question-bank switch: disabled question create 403, legacy task keeps focus and pasted marker; enabled task focus null; quick follows its feature flag; mock requires checkpoint", async () => {
  const s = await create(); s.evaluation = evaluation; saveSession("u", s);
  process.env.QUESTION_BANK_ENABLED = "false";
  try {
    const r = await call("create", "POST", input()); assert.equal(r.status, 403); assert.equal(r.body.code, "feature_disabled");
    const legacy = await call("create", "POST", { kind: "task", mode: "practice", prompt: catalog.questions[1].text });
    assert.equal(legacy.status, 201); assert.equal(legacy.body.session.question, null); assert.ok(legacy.body.session.focus);
    const marker = table(db.$client, "attempt_markers").find(m => m.attempt_id === legacy.body.session.id)!;
    assert.equal(marker.question_id, null); assert.equal(marker.exposure_key, catalog.questions[1].exposureKey);
  } finally { process.env.QUESTION_BANK_ENABLED = "true"; }
  assert.equal((await call("create", "POST", { kind: "task", mode: "practice" })).body.session.focus, null);
  for (const enabled of ["true", "false"]) {
    process.env.QUICK_ENABLED = enabled;
    const quick = await call("create", "POST", input({ activity: "quick" }));
    assert.equal(quick.status, enabled === "true" ? 201 : 403);
    if (enabled === "true") { assert.equal(quick.body.session.activity, "quick"); assert.equal(quick.body.session.stage, "quick"); }
    else assert.equal(quick.body.code, "feature_disabled");
  }
  const mock = await call("create", "POST", input({ mode: "mock" })); assert.equal(mock.status, 409); assert.equal(mock.body.code, "mock_requires_checkpoint");
});

test("creation receipt failure rolls back session, marker and exposure together", async () => {
  const before = records();
  db.$client.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON request_receipts BEGIN SELECT RAISE(ABORT, 'injected receipt failure'); END");
  const log = console.error; console.error = () => {};
  try { assert.equal((await call("create", "POST", input())).status, 500); assert.deepEqual(records(), before); }
  finally { console.error = log; db.$client.exec("DROP TRIGGER fail_receipt"); }
});

test("account deletion clears every user table including six facts and hashed user auth limits; catalog and another user's data survive", async () => {
  const s = await create(); completed(s);
  db.$client.prepare("INSERT INTO default_continuations VALUES(?,?,?,?)").run("u", "quick-source", s.id, time);
  const password = "offline-password-123";
  db.$client.prepare("UPDATE users SET password_hash=? WHERE id='u'").run(await hashPassword(password));
  for (const key of ["password:u", "model:u", "login:u@wp2c.test", "registration:u@wp2c.test"]) limitAuth(key);
  const otherBefore = db.$client.prepare("SELECT * FROM writing_sessions WHERE user_id='other'").all();
  const catalogBefore = table(db.$client, "questions");
  const r = await call("account", "DELETE", { password, confirmation: "删除我的账户" }); assert.equal(r.status, 200);
  for (const name of ["auth_sessions", "writing_sessions", "attempt_markers", "completion_events", "familiarity", "legacy_scan", "default_continuations", "request_receipts"]) {
    assert.equal(db.$client.prepare(`SELECT * FROM ${name} WHERE user_id='u'`).all().length, 0, name);
  }
  assert.equal(db.$client.prepare("SELECT * FROM users WHERE id='u'").get(), undefined);
  for (const key of ["delete:u", "password:u", "model:u", "login:u@wp2c.test", "registration:u@wp2c.test"]) assert.equal(db.$client.prepare("SELECT * FROM auth_attempts WHERE key=?").get(digest(key)), undefined);
  assert.deepEqual(table(db.$client, "questions"), catalogBefore);
  assert.deepEqual(db.$client.prepare("SELECT * FROM writing_sessions WHERE user_id='other'").all(), otherBefore);
});
