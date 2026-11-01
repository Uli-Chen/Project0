// Offline, real routes + SQLite. No listener, no production database, no external model.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { inRequest } from "../../../../tests/helpers/request-context.ts";
import { getDb } from "../../../../lib/db/client.ts";
import { importQuestions } from "../../../../lib/db/import-questions.ts";
import { markNewUserScanned } from "../../../../lib/db/migrate-0.4.ts";
import { catalog, requirements, evaluation, essay } from "../../../../tests/helpers/practice-db.ts";
import { hashPassword } from "../../../../lib/auth/password.ts";
import { POST as CREATE } from "../../../../app/api/sessions/route.ts";
import { GET, PATCH, DELETE } from "../../../../app/api/sessions/[id]/route.ts";
import { POST as ACTION } from "../../../../app/api/sessions/[id]/actions/route.ts";
import { POST as LIFECYCLE } from "../../../../app/api/sessions/[id]/lifecycle/route.ts";
import { DELETE as ACCOUNT } from "../../../../app/api/auth/account/route.ts";
assert.equal(process.env.LLM_API_KEY, "");
const temporary = mkdtempSync(join(tmpdir(), "opc-wp2c-e2e-"));
process.env.DATABASE_PATH = join(temporary, "test.db");
process.env.QUESTION_BANK_ENABLED = "true";
process.env.APP_ORIGIN = "http://wp2c.test";
const output = resolve("docs/plans/reports/WP2c_e2e");
const db = getDb(); migrate(db, { migrationsFolder: resolve("drizzle") });
importQuestions(db.$client, catalog, requirements);
const token = "c".repeat(64), user = "wp2c-e2e", password = "offline-password-123", time = new Date().toISOString();
const tables = ["users", "auth_sessions", "auth_attempts", "writing_sessions", "attempt_markers", "completion_events", "familiarity", "legacy_scan", "default_continuations", "request_receipts"];
const rows = name => db.$client.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all();
const snapshot = () => Object.fromEntries(tables.map(name => [name, rows(name).map(row => {
  if (name === "users") return { ...row, password_hash: "[offline fixture redacted]" };
  if (name === "auth_sessions") return { ...row, token_hash: "[offline fixture redacted]" };
  return row;
})]));
const save = (name, data) => writeFileSync(join(output, name), JSON.stringify(data, null, 2) + "\n");
const blockedFetch = async () => { throw new Error("Network forbidden in WP2c E2E"); };
globalThis.fetch = blockedFetch;
const log = [];
async function call(endpoint, method, body, id = "", status = 200) {
  const path = endpoint === "account" ? "/api/auth/account" : `/api/sessions${id ? `/${id}` : ""}${["actions", "lifecycle"].includes(endpoint) ? `/${endpoint}` : ""}`;
  const request = new Request(process.env.APP_ORIGIN + path, { method, headers: { origin: process.env.APP_ORIGIN, cookie: `wm_session=${token}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const response = await inRequest(request, () => {
    if (endpoint === "create") return CREATE(request);
    if (endpoint === "account") return ACCOUNT(request);
    return (endpoint === "actions" ? ACTION : endpoint === "lifecycle" ? LIFECYCLE : ({ GET, PATCH, DELETE })[method])(request, { params: Promise.resolve({ id }) });
  });
  const data = await response.json();
  assert.equal(response.status, status, JSON.stringify(data));
  log.push({ method, path, status: response.status, result: data, database: snapshot() });
  console.log(`PASS ${method} ${path} -> ${response.status}`);
  return data.session;
}
function render(id, label, bank = true) {
  const before = snapshot();
  const result = spawnSync(process.execPath, ["--import", "tsx", join(output, "render.mjs"), id, label], { encoding: "utf8", env: { ...process.env, LLM_API_KEY: "", QUESTION_BANK_ENABLED: String(bank) } });
  console.log(result.stdout.trim()); if (result.stderr) console.error(result.stderr);
  assert.equal(result.status, 0); assert.deepEqual(snapshot(), before, "opening authenticated page must not write or change student recency");
}
async function fakeModel(values, work) {
  const calls = [];
  process.env.LLM_API_KEY = "offline-fixture-only";
  try {
    globalThis.fetch = async (_url, init) => {
      assert.equal(db.$client.inTransaction, false);
      const request = JSON.parse(init.body), value = values.shift(); assert.ok(value, "unexpected model call");
      calls.push(request);
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] });
    };
    const result = await work(); assert.equal(values.length, 0); return { result, calls };
  } finally { process.env.LLM_API_KEY = ""; globalThis.fetch = blockedFetch; }
}
try {
  db.$client.prepare("INSERT INTO users(id,email,name,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)").run(user, "wp2c@example.test", "WP2c E2E", await hashPassword(password), time, time);
  db.$client.prepare("INSERT INTO auth_sessions VALUES(?,?,?)").run(createHash("sha256").update(token).digest("hex"), user, Date.now() + 3600000);
  markNewUserScanned(db.$client, user, time);
  const input = { questionId: catalog.questions[0].id, activity: "deep", mode: "practice", idempotencyKey: "wp2c-end-to-end" };
  let state = await call("create", "POST", input, "", 201);
  const id = state.id;
  assert.deepEqual((await call("create", "POST", input)).question, state.question);
  assert.equal(rows("writing_sessions").length, 1); assert.equal(rows("attempt_markers").length, 1);
  state = await call("session", "PATCH", { version: state.version, drafts: { original: essay, revision: "" } }, id);
  assert.equal(JSON.parse(rows("writing_sessions")[0].state_json).drafts.original, essay);
  state = await call("actions", "POST", { action: "startWriting" }, id);
  render(id, "writing");
  for (const [action, expected] of [["setAside", "set_aside"], ["resume", "open"]]) {
    state = await call("lifecycle", "POST", { action }, id); assert.equal(state.lifecycle, expected); assert.equal(state.stage, "writing");
    assert.equal(rows("completion_events").length, 0);
  }
  const model = await fakeModel([evaluation, { memoryChanges: [{ kind: "new", text: "本篇已提供具体的公共交通例子。" }] }], async () => {
    state = await call("actions", "POST", { action: "evaluate", kind: "original" }, id);
    const studentTime = state.lastStudentActionAt;
    assert.ok(state.completedAt); assert.equal(state.lifecycle, "open");
    assert.equal((await call("session", "GET", undefined, id)).lastStudentActionAt, studentTime);
    state = await call("actions", "POST", { action: "finish" }, id);
    assert.equal("planChange" in state.finish, false);
  });
  save("model-fixtures.json", { fakeFetchOnly: true, calls: model.calls });
  render(id, "finished-topic"); render(id, "finished-bank-off", false);
  const legacy = await call("create", "POST", { kind: "free", mode: "practice", prompt: catalog.questions[1].text }, "", 201);
  // The second finish view has the same supported finish data, but no bank snapshot.
  const legacyRow = JSON.parse(rows("writing_sessions").find(r => r.id === legacy.id).state_json);
  Object.assign(legacyRow, { stage: "finished", finish: state.finish, evaluation: state.evaluation, submitted: state.submitted });
  db.$client.prepare("UPDATE writing_sessions SET state_json=? WHERE id=?").run(JSON.stringify(legacyRow), legacy.id);
  render(legacy.id, "finished-pasted");
  const event = structuredClone(rows("completion_events"));
  state = await call("lifecycle", "POST", { action: "close" }, id);
  assert.equal(state.lifecycle, "closed"); assert.equal(state.stage, "finished"); assert.deepEqual(rows("completion_events"), event);
  await call("session", "DELETE", undefined, id);
  assert.equal(rows("writing_sessions").some(r => r.id === id), false);
  assert.ok(rows("attempt_markers").find(r => r.attempt_id === id).deleted_at);
  assert.equal(rows("completion_events").find(r => r.attempt_id === id).evidence_deleted, 1);
  assert.ok(rows("familiarity").some(r => r.exposure_key === state.question.exposureKey));
  await call("create", "POST", input, "", 409);
  let repeat = await call("create", "POST", { ...input, idempotencyKey: "wp2c-repeat" }, "", 201);
  repeat = await call("session", "PATCH", { version: repeat.version, drafts: { original: essay, revision: "" } }, repeat.id);
  await call("actions", "POST", { action: "startWriting" }, repeat.id);
  await fakeModel([evaluation], async () => {
    repeat = await call("actions", "POST", { action: "evaluate", kind: "original" }, repeat.id);
    assert.equal(repeat.originalFreshness, "repeat");
  });
  await call("account", "DELETE", { password, confirmation: "删除我的账户" });
  for (const name of tables) assert.equal(rows(name).length, 0, name);
  assert.equal(rows("questions").length, catalog.questions.length);
  save("steps-and-database.json", log);
  save("summary.json", { passed: true, routeCalls: log.length, rendering: "real authenticated EssayPage + React SSR, no browser or listener", tempDatabaseRemovedAfterRun: true, network: "blocked; deterministic fetch fixtures only", emptyUserTables: tables, remainingQuestions: rows("questions").length });
  console.log("PASS all route/database steps; three finish link cases; page opens leave database unchanged; account clears every user table.");
} finally { db.$client.close(); rmSync(temporary, { recursive: true, force: true }); }
