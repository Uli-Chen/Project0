// Offline evidence runner. Run from the repository root with --conditions=react-server --import tsx.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { inRequest } from "../../../../tests/helpers/request-context.ts";
import { getDb } from "../../../../lib/db/client.ts";
import { legacySession } from "../../../../tests/helpers/legacy-session.ts";
import { evaluation, essay, catalog } from "../../../../tests/helpers/practice-db.ts";
import { register } from "../../../../instrumentation.ts";
import { GET, PATCH } from "../../../../app/api/sessions/[id]/route.ts";
import { POST as ACTION } from "../../../../app/api/sessions/[id]/actions/route.ts";
import { POST as CREATE } from "../../../../app/api/sessions/route.ts";

const directory = resolve("docs/plans/reports/WP2b_e2e");
const filename = process.env.DATABASE_PATH;
assert.ok(filename && realpathSync(dirname(filename)).startsWith("/private/tmp/opc-wp2b-e2e."), "requires a dedicated temporary database");
assert.equal(process.env.LLM_API_KEY, "", "start with an explicitly empty model key");
const db = getDb().$client;
const user = "wp2b-e2e-user", oldId = "wp2b-legacy-finished";
const token = "e".repeat(64); // Only authenticates the synthetic user in this temporary database.
const origin = "http://127.0.0.1:31404";
process.env.APP_ORIGIN = origin;
process.env.NEXT_RUNTIME = "nodejs";
globalThis.fetch = async () => { throw new Error("Network disabled by E2E harness"); };
const save = (name, value) => writeFileSync(join(directory, name), typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n");
const rows = (table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
const raw = (id) => db.prepare("SELECT state_json FROM writing_sessions WHERE user_id=? AND id=?").get(user, id).state_json;
const events = (id) => db.prepare("SELECT * FROM completion_events WHERE user_id=? AND attempt_id=? ORDER BY rowid").all(user, id);
const snapshot = () => Object.fromEntries(["writing_sessions", "legacy_scan", "attempt_markers", "completion_events", "familiarity", "default_continuations", "request_receipts"].map(name => [name, rows(name)]));
const hash = (value) => createHash("sha256").update(value).digest("hex");
async function call(method, id, body, authenticated = true) {
  const path = id === null ? "/api/sessions" : `/api/sessions/${id}${method === "POST" ? "/actions" : ""}`;
  const request = new Request(origin + path, { method, headers: { origin, "content-type": "application/json", ...(authenticated ? { cookie: `wm_session=${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const response = await inRequest(request, () => id === null ? CREATE(request) : ({ GET, PATCH, POST: ACTION })[method](request, { params: Promise.resolve({ id }) }));
  const data = await response.json();
  console.log(`${method} ${path} -> ${response.status}`);
  return { status: response.status, data };
}
async function ok(method, id, body, expected = 200) {
  const result = await call(method, id, body);
  assert.equal(result.status, expected, JSON.stringify(result.data));
  return result.data.session;
}
const action = (id, input) => ok("POST", id, { ...input, requestId: crypto.randomUUID() });
const calls = [];
async function fakeModel(plan, work) {
  const offline = globalThis.fetch;
  process.env.LLM_API_KEY = "offline-fixture-only";
  process.env.LLM_BASE_URL = "http://127.0.0.1:1/offline-fake";
  process.env.LLM_MODEL = "wp2b-offline-fixture";
  let index = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "http://127.0.0.1:1/offline-fake/chat/completions");
    const request = JSON.parse(init.body);
    const instruction = request.messages[0].content;
    const kind = instruction.includes("Evaluate ONLY the supplied essay") ? "score" : instruction.includes("Review how the student") ? "review" : "unexpected";
    const expected = plan[index++];
    assert.ok(expected, "unexpected extra model call"); assert.equal(kind, expected.kind);
    calls.push({ sequence: calls.length + 1, kind, responseStatus: expected.fail ? 503 : 200, model: request.model, context: JSON.parse(request.messages[1].content) });
    expected.inspect?.();
    return expected.fail ? Response.json({ error: "offline injected failure" }, { status: 503 }) : Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(kind === "score" ? evaluation : { ...evaluation.review, breakthrough: "离线回顾成功标记" }) } }] });
  };
  try { const result = await work(); assert.equal(index, plan.length); return result; }
  finally { globalThis.fetch = offline; process.env.LLM_API_KEY = ""; }
}
function render(id, label) {
  const result = spawnSync(process.execPath, ["--import", "tsx", join(directory, "render.mjs"), id, label], { encoding: "utf8", env: { ...process.env, LLM_API_KEY: "" } });
  console.log(result.stdout); if (result.stderr) console.error(result.stderr);
  assert.equal(result.status, 0, "page rendering failed");
}
try {
  const mode = process.argv[2];
  if (mode === "seed") {
    assert.equal(rows("users").length, 0);
    const state = legacySession();
    state.id = oldId; state.stage = "finished";
    state.prompt = { id: "technology", text: "Many people now work from home using modern technology. Do the advantages of this trend outweigh the disadvantages?", topicTags: ["technology", "work"], questionType: "adv_disadv" };
    state.drafts.original = essay; state.submitted.original = essay; state.evaluation = evaluation;
    const json = JSON.stringify(state, null, 2) + "\n";
    db.prepare("INSERT INTO users(id,email,name,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)").run(user, "wp2b@example.test", "WP2b E2E", "not-a-real-password", state.createdAt, state.updatedAt);
    db.prepare("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").run(hash(token), user, Date.now() + 86400000);
    db.prepare("INSERT INTO writing_sessions(user_id,id,state_json,created_at,updated_at) VALUES(?,?,?,?,?)").run(user, oldId, json, state.createdAt, state.updatedAt);
    assert.equal(rows("legacy_scan").length, 0); assert.equal("schemaVersion" in state, false);
    save("legacy-before.json", json); save("scan-before.json", snapshot());
    console.log("PASS seed: one user, no legacy_scan, finished legacy JSON without schemaVersion");
  } else if (mode === "scan-1" || mode === "scan-2") {
    await register();
    const current = snapshot();
    assert.equal(current.legacy_scan.length, 1); assert.equal(current.legacy_scan[0].user_id, user);
    assert.equal(events(oldId).length, 1); assert.equal(events(oldId)[0].legacy, 1); assert.equal(events(oldId)[0].completed_at, null);
    const facts = current.familiarity.find(row => row.exposure_key === "qfamily_remote_work");
    assert.equal(facts.deep_original_submitted, "unknown_time"); assert.equal(facts.prior_feedback, "unknown_time");
    const before = readFileSync(join(directory, "legacy-before.json"));
    assert.ok(before.equals(Buffer.from(raw(oldId))));
    save(`${mode}.json`, current); save(`legacy-after-${mode}.json`, raw(oldId));
    if (mode === "scan-2") assert.deepEqual(current, JSON.parse(readFileSync(join(directory, "scan-1.json"), "utf8")));
    console.log(`PASS ${mode}: pid=${process.pid}, legacy=1, completed_at=null, both familiarity=unknown_time, byte equality, sha256=${hash(before)}`);
  } else if (mode === "scenarios") {
    assert.equal((await call("GET", oldId, undefined, false)).status, 401);
    const legacy = await ok("GET", oldId);
    assert.equal(legacy.stage, "finished"); assert.equal(legacy.completedAt, null);
    save("legacy-projection.json", legacy); render(oldId, "legacy");

    // Create the failed-review fixture through actual create/save/action routes, not direct event inserts.
    let review = await ok("POST", null, { kind: "free", mode: "practice", prompt: catalog.questions[0].text }, 201);
    const outline = structuredClone(review.outline); outline.stance = { text: "支持公共交通", sources: ["学生输入"] };
    review = await ok("PATCH", review.id, { version: review.version, drafts: { original: essay, revision: "" }, outline });
    await action(review.id, { action: "startWriting" });
    review = await fakeModel([{ kind: "score" }, { kind: "review", fail: true }], () => action(review.id, { action: "evaluate", kind: "original" }));
    assert.equal(review.stage, "feedback"); assert.equal(review.reviewStatus, "failed");
    const completion = events(review.id), score = structuredClone(review.evaluation.scores), issues = structuredClone(review.evaluation.issues);
    assert.equal(completion.length, 1);
    save("review-failed-initial.json", { session: review, events: completion }); render(review.id, "review-failed");
    const first = calls.length;
    review = await fakeModel([{ kind: "review" }], () => action(review.id, { action: "retryReview" }));
    assert.equal(calls.length - first, 1); assert.equal(review.reviewStatus, "ok"); assert.equal(review.stage, "feedback");
    assert.deepEqual(review.evaluation.scores, score); assert.deepEqual(review.evaluation.issues, issues); assert.deepEqual(events(review.id), completion);
    save("review-retry-ok.json", { session: review, events: events(review.id), modelCalls: calls.slice(first) }); render(review.id, "review-ok");

    // Re-establish failed status only: ok review retries are intentionally no-ops.
    const fixture = JSON.parse(raw(review.id)); fixture.reviewStatus = "failed";
    db.prepare("UPDATE writing_sessions SET state_json=? WHERE user_id=? AND id=?").run(JSON.stringify(fixture), user, review.id);
    const second = calls.length;
    review = await fakeModel([{ kind: "review", fail: true }], () => action(review.id, { action: "retryReview" }));
    assert.equal(calls.length - second, 1); assert.equal(review.reviewStatus, "failed"); assert.equal(review.stage, "feedback");
    assert.deepEqual(review.evaluation.scores, score); assert.deepEqual(review.evaluation.issues, issues); assert.deepEqual(events(review.id), completion);
    save("review-retry-failed.json", { fixtureReset: "reviewStatus: ok -> failed only; events unchanged", session: review, events: events(review.id), modelCalls: calls.slice(second) }); render(review.id, "review-failed-again");

    const freshQuestion = catalog.questions.find(q => q.exposureKey !== completion[0].exposure_key && q.exposureKey !== "qfamily_remote_work");
    assert.ok(freshQuestion);
    let fresh = await ok("POST", null, { kind: "free", mode: "practice", prompt: freshQuestion.text }, 201);
    assert.equal(fresh.activity, "deep"); assert.equal(fresh.originalSubmittedAt, null); assert.equal(events(fresh.id).length, 0);
    fresh = await ok("PATCH", fresh.id, { version: fresh.version, drafts: { original: essay, revision: "" } });
    await action(fresh.id, { action: "startWriting" });
    const start = new Date().toISOString();
    const checkpoint = {};
    fresh = await fakeModel([{ kind: "score", inspect() {
      const accepted = JSON.parse(raw(fresh.id)); checkpoint.stage = accepted.stage; checkpoint.originalSubmittedAt = accepted.originalSubmittedAt; checkpoint.events = events(fresh.id);
      assert.ok(accepted.originalSubmittedAt); assert.equal(accepted.stage, "evaluating"); assert.equal(checkpoint.events.length, 0);
    } }], () => action(fresh.id, { action: "evaluate", kind: "original" }));
    const end = new Date().toISOString(), event = events(fresh.id);
    assert.equal(fresh.stage, "feedback"); assert.equal(fresh.originalFreshness, "fresh"); assert.equal(event.length, 1);
    assert.ok(fresh.originalSubmittedAt >= start && fresh.originalSubmittedAt <= end);
    assert.ok(event[0].completed_at >= fresh.originalSubmittedAt && event[0].completed_at <= end);
    assert.equal(event[0].legacy, 0); assert.equal(event[0].freshness, "fresh");
    assert.equal(event[0].original_submitted_at, fresh.originalSubmittedAt); assert.equal(fresh.completedAt, event[0].completed_at);
    assert.equal(JSON.parse(raw(fresh.id)).originalSubmittedAt, fresh.originalSubmittedAt);
    save("new-original.json", { start, end, acceptedBeforeModel: checkpoint, session: fresh, events: event }); render(fresh.id, "new-original");
    save("model-calls.json", calls); save("database-final.json", snapshot());
    assert.ok(readFileSync(join(directory, "legacy-before.json")).equals(Buffer.from(raw(oldId))));
    console.log("PASS all four scenarios: startup/restart, authenticated legacy page, failed/ok/failed review, fresh original feedback.");
    console.log(`PASS model calls: ${calls.length} total, ${calls.filter(c => c.kind === "score").length} score, ${calls.filter(c => c.kind === "review").length} review; every call intercepted in memory.`);
  } else throw new Error("Use seed, scan-1, scan-2, or scenarios");
} finally { db.close(); }
