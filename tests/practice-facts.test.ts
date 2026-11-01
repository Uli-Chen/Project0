import assert from "node:assert/strict";
import { test } from "node:test";
import { fork } from "node:child_process";
import { resolve } from "node:path";
import { runAction, type Checkpoint } from "../lib/pipeline/engine";
import { originalFreshness } from "../lib/rules/original-freshness";
import { commitPracticeCheckpoint, completedAtForSession, isExposureUnknown, markPracticeDeleted } from "../lib/db/practice-facts";
import { scanLegacyUser, scanUnscannedUsers } from "../lib/db/migrate-0.4";
import { getRequestReceipt, writeRequestReceipt, ReceiptConflict } from "../lib/db/request-receipts";
import { fixture, session, save, read, table, evaluation, time, catalog, requirements } from "./helpers/practice-db";
import { importQuestions } from "../lib/db/import-questions";
import type { SessionState } from "../lib/pipeline/types";

const later = "2026-11-02T01:00:00.000Z";
function persistence(f: ReturnType<typeof fixture>, userId = "u", now = time): Checkpoint {
  return (s, event) => event ? commitPracticeCheckpoint(f.sqlite, userId, s, event, s => save(f.sqlite, userId, s), now) : save(f.sqlite, userId, s);
}
async function models<T>(outputs: Array<unknown | "fail">, work: () => Promise<T>) {
  const oldFetch = globalThis.fetch, key = process.env.LLM_API_KEY;
  process.env.LLM_API_KEY = "offline-fixture-only";
  let calls = 0;
  globalThis.fetch = async () => {
    calls++; assert.ok(outputs.length, "No unexpected model call is allowed");
    const output = outputs.shift();
    return output === "fail" ? new Response("unavailable", { status: 503 }) : Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }] });
  };
  try { const result = await work(); assert.equal(outputs.length, 0); return { result, calls }; }
  finally { globalThis.fetch = oldFetch; if (key === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = key; }
}
function accept(f: ReturnType<typeof fixture>, s: SessionState, now = time) {
  save(f.sqlite, "u", s);
  s.submitted.original = s.drafts.original; s.stage = "evaluating";
  commitPracticeCheckpoint(f.sqlite, "u", s, "acceptOriginal", s => save(f.sqlite, "u", s), now);
  return s;
}

test("fresh-original pure rule: rewrite, prior submission or feedback precede unknown; Quick alone does not disqualify", () => {
  for (const fact of ["known", "unknown_time"] as const) {
    assert.equal(originalFreshness({ rewrite: false, submitted: fact, feedback: "none", exposureUnknown: true }), "repeat");
    assert.equal(originalFreshness({ rewrite: false, submitted: "none", feedback: fact, exposureUnknown: true }), "repeat");
  }
  assert.equal(originalFreshness({ rewrite: true, submitted: "none", feedback: "none", exposureUnknown: false }), "repeat");
  assert.equal(originalFreshness({ rewrite: false, submitted: "none", feedback: "none", exposureUnknown: false }), "fresh");
  assert.equal(originalFreshness({ rewrite: false, submitted: "none", feedback: "none", exposureUnknown: true }), "unknown");
});

test("1 Required feedback saved; optional review fails or response is lost: one completion; retry/refresh/finish never moves it", async () => {
  const f = fixture(); f.user();
  try {
    const s = session(true); save(f.sqlite, "u", s);
    let inOptional = false;
    const persist: Checkpoint = (s, event) => {
      persistence(f)(s, event);
      if (event === "completeOriginal") {
        inOptional = true;
        assert.equal(read(f.sqlite, "u", s.id).stage, "feedback");
        assert.equal(table(f.sqlite, "completion_events").length, 1);
      }
    };
    await models([evaluation, "fail"], () => runAction(s, { action: "evaluate", kind: "original" }, persist));
    assert.ok(inOptional);
    const failed = read(f.sqlite, "u", s.id), events = table(f.sqlite, "completion_events");
    assert.equal(failed.reviewStatus, "failed"); assert.equal(failed.evalError, null); assert.equal(failed.stage, "feedback");
    assert.equal(failed.completedAt, time); assert.equal(failed.originalFreshness, "fresh");
    const retry = await models([evaluation.review], () => runAction(failed, { action: "retryReview" }, persistence(f, "u", later)));
    assert.equal(retry.calls, 1); assert.equal(retry.result.reviewStatus, "ok");
    assert.deepEqual(retry.result.evaluation?.scores, failed.evaluation?.scores);
    const finished = await models([{ memoryChanges: [{ kind: "new", text: "有具体例子" }], planChange: "继续练习" }], () => runAction(retry.result, { action: "finish" }, persistence(f, "u", later)));
    save(f.sqlite, "u", finished.result);
    assert.deepEqual(table(f.sqlite, "completion_events"), events);
    assert.equal(completedAtForSession(f.sqlite, "u", s.id), time);
  } finally { f.close(); }
});

test("1b 原稿评估第一次调用失败: accepted time/freshness survive and scoring retry never recalculates", async () => {
  const f = fixture(); f.user();
  try {
    const s = session(); save(f.sqlite, "u", s);
    await models(["fail"], () => assert.rejects(runAction(s, { action: "evaluate", kind: "original" }, persistence(f))));
    const failed = read(f.sqlite, "u", s.id);
    assert.equal(failed.originalSubmittedAt, time); assert.equal(failed.originalFreshness, "fresh");
    assert.equal(table(f.sqlite, "completion_events").length, 0);
    assert.equal(table(f.sqlite, "familiarity")[0].deep_original_submitted, "known");
    const second = accept(f, session(), later); assert.equal(second.originalFreshness, "repeat");
    const retry = await models([evaluation], () => runAction(failed, { action: "evaluate", kind: "original" }, persistence(f, "u", later)));
    assert.equal(retry.result.originalSubmittedAt, time); assert.equal(retry.result.originalFreshness, "fresh");
    assert.equal(retry.result.completedAt, later);
    assert.equal(table(f.sqlite, "attempt_markers").length, 2);
  } finally { f.close(); }
});

test("1c 旧会话原稿已提交、评分一直失败；迁移后重试成功: current completion with null historical submission time", async () => {
  const f = fixture(); f.user("u", false);
  try {
    const s = session(); s.submitted.original = s.drafts.original; s.stage = "evaluating"; s.schemaVersion = 1; save(f.sqlite, "u", s);
    scanLegacyUser(f.sqlite, "u");
    assert.equal(table(f.sqlite, "familiarity")[0].deep_original_submitted, "unknown_time");
    const result = await models([evaluation], () => runAction(s, { action: "evaluate", kind: "original" }, persistence(f)));
    assert.equal(result.result.completedAt, time); assert.equal(result.result.originalSubmittedAt, null);
    const event = table(f.sqlite, "completion_events")[0];
    assert.equal(event.original_submitted_at, null); assert.equal(event.completed_at, time); assert.equal(event.freshness, "unknown");
    assert.equal(table(f.sqlite, "familiarity")[0].deep_original_submitted, "unknown_time");
  } finally { f.close(); }
});

test("1d 家族曝光未知时提交原稿，之后历史解析为已知: frozen unknown then repeat", async () => {
  const f = fixture(); f.user("u", false);
  try {
    const old = session(); old.prompt.text = "A historical question that has not been reviewed."; save(f.sqlite, "u", old);
    scanLegacyUser(f.sqlite, "u");
    const first = accept(f, session()); assert.equal(first.originalFreshness, "unknown");
    f.sqlite.prepare("INSERT INTO question_aliases VALUES(?,?,?,?,?,?,?)").run("legacy-20261101-v1", "text", old.prompt.text.toLowerCase(), "not_in_catalog", null, "test reviewer", "reviewed");
    scanLegacyUser(f.sqlite, "u", { rescan: true });
    assert.equal(isExposureUnknown(f.sqlite, "u", catalog.questions[0].exposureKey), false);
    const result = await models([evaluation], () => runAction(first, { action: "evaluate", kind: "original" }, persistence(f, "u", later)));
    assert.equal(result.result.originalFreshness, "unknown");
    assert.equal(table(f.sqlite, "completion_events")[0].freshness, "unknown");
    assert.equal(accept(f, session(), later).originalFreshness, "repeat");
  } finally { f.close(); }
});

test("1e 家族已有反馈记录 prior_feedback=known 但没有提交记录: repeat and unconditional submission marker", () => {
  const f = fixture(); f.user();
  try {
    f.sqlite.prepare("INSERT INTO familiarity(user_id,exposure_key,first_attempt_id,prior_feedback) VALUES(?,?,?,?)").run("u", catalog.questions[0].exposureKey, "prior", "known");
    const s = accept(f, session()); assert.equal(s.originalFreshness, "repeat"); assert.equal(s.originalSubmittedAt, time);
    assert.equal(table(f.sqlite, "familiarity")[0].deep_original_submitted, "known");
    assert.equal(table(f.sqlite, "familiarity")[0].fresh_attempt_id, null);
  } finally { f.close(); }
});

test("2 两个标签页同时提交同一家族: two processes and connections on a real temporary SQLite grant exactly one fresh", async () => {
  const f = fixture(); f.user();
  const children: ReturnType<typeof fork>[] = [];
  try {
    const states = [session(), session()]; states.forEach(s => save(f.sqlite, "u", s));
    const ready: Promise<void>[] = [], done: Promise<unknown>[] = [];
    for (const s of states) {
      const child = fork(resolve("tests/helpers/concurrent-submit.ts"), [f.filename, "u", s.id], { execArgv: ["--conditions=react-server", "--import", "tsx"], stdio: ["ignore", "ignore", "inherit", "ipc"] });
      children.push(child);
      ready.push(new Promise((resolve, reject) => { child.on("message", m => { if (m === "ready") resolve(); }); child.on("error", reject); child.on("exit", code => { if (code) reject(new Error(`worker exited ${code}`)); }); }));
      done.push(new Promise((resolve, reject) => { child.on("message", m => { if (m !== "ready") resolve(m); }); child.on("error", reject); child.on("exit", code => { if (code) reject(new Error(`worker exited ${code}`)); }); }));
    }
    await Promise.all(ready); children.forEach(child => child.send("submit"));
    const results = await Promise.all(done) as Array<{ freshness: string }>;
    assert.deepEqual(results.map(r => r.freshness).sort(), ["fresh", "repeat"]);
    const accepted = states.map(s => read(f.sqlite, "u", s.id));
    assert.deepEqual(accepted.map(s => s.originalFreshness).sort(), ["fresh", "repeat"]);
    assert.equal(table(f.sqlite, "familiarity")[0].fresh_attempt_id, accepted.find(s => s.originalFreshness === "fresh")!.id);
  } finally { children.forEach(c => c.kill()); f.close(); }
});

test("5 Old finished record saved or regraded after upgrade: unknown-date event stays immutable and only feedbackUpdatedAt changes", () => {
  const f = fixture(); f.user("u", false);
  try {
    const s = session(); s.stage = "finished"; s.submitted.original = s.drafts.original; s.evaluation = structuredClone(evaluation); save(f.sqlite, "u", s);
    scanLegacyUser(f.sqlite, "u");
    const before = table(f.sqlite, "completion_events");
    save(f.sqlite, "u", read(f.sqlite, "u", s.id));
    assert.deepEqual(table(f.sqlite, "completion_events"), before);
    const regraded = read(f.sqlite, "u", s.id);
    regraded.stage = "feedback";
    regraded.evaluation = structuredClone(evaluation);
    regraded.evaluation.scores.rationale.TR = "重新核对原稿后的反馈";
    commitPracticeCheckpoint(f.sqlite, "u", regraded, "completeOriginal", s => save(f.sqlite, "u", s), later);
    assert.deepEqual(table(f.sqlite, "completion_events"), before);
    const saved = read(f.sqlite, "u", s.id);
    assert.equal(saved.feedbackUpdatedAt, later); assert.equal(saved.completedAt, null);
    assert.equal(saved.stage, "feedback"); assert.deepEqual(saved.evaluation, regraded.evaluation);
    assert.equal(saved.originalSubmittedAt, s.originalSubmittedAt); assert.equal(saved.originalFreshness, s.originalFreshness);
    assert.equal(before.length, 1);
    assert.equal(before[0].legacy, 1); assert.equal(before[0].completed_at, null);
    assert.equal(table(f.sqlite, "completion_events").filter(e => e.completed_at !== null).length, 0);
    assert.equal(table(f.sqlite, "familiarity")[0].prior_feedback, "unknown_time");
  } finally { f.close(); }
});

test("Free-entry repeat of a question family or alias: same family cannot become fresh through pasted normalized text", async () => {
  const f = fixture(); f.user();
  try {
    const first = session(); first.prompt = { ...first.prompt, id: "technology", text: "Many people now work from home using modern technology. Do the advantages of this trend outweigh the disadvantages?" };
    assert.equal(accept(f, first).originalFreshness, "fresh");
    const second = session(); second.prompt.text = "  " + catalog.questions.find((q: { exposureKey: string }) => q.exposureKey === "qfamily_remote_work").text.toUpperCase().replaceAll(" ", "　") + "  ";
    accept(f, second); assert.equal(second.originalFreshness, "repeat");
    await models([evaluation], () => runAction(second, { action: "evaluate", kind: "original" }, persistence(f)));
    assert.equal(table(f.sqlite, "completion_events")[0].freshness, "repeat");
    assert.equal(table(f.sqlite, "completion_events")[0].exposure_key, "qfamily_remote_work");
  } finally { f.close(); }
});

test("feedback save failure rolls back the event, feedback and familiarity together; error checkpoint cannot leak feedback", async () => {
  const f = fixture(); f.user();
  try {
    const s = session(); save(f.sqlite, "u", s);
    const checkpoint: Checkpoint = (state, event) => {
      if (event === "completeOriginal") commitPracticeCheckpoint(f.sqlite, "u", state, event, state => { save(f.sqlite, "u", state); throw new Error("disk failure"); }, time);
      else persistence(f)(state, event);
    };
    await models([evaluation], () => assert.rejects(runAction(s, { action: "evaluate", kind: "original" }, checkpoint), /disk failure/));
    assert.equal(table(f.sqlite, "completion_events").length, 0);
    assert.equal(read(f.sqlite, "u", s.id).evaluation, null); assert.equal(read(f.sqlite, "u", s.id).stage, "evaluating");
    assert.equal(table(f.sqlite, "familiarity")[0].prior_feedback, "none");
    assert.equal(read(f.sqlite, "u", s.id).originalFreshness, "fresh");
  } finally { f.close(); }
});

test("original acceptance rollback leaves no marker or fresh claim; missing/deleted attempt cannot be recreated", () => {
  const f = fixture(); f.user();
  try {
    const s = session(); save(f.sqlite, "u", s); s.submitted.original = s.drafts.original;
    assert.throws(() => commitPracticeCheckpoint(f.sqlite, "u", s, "acceptOriginal", s => { save(f.sqlite, "u", s); throw new Error("write failed"); }), /write failed/);
    assert.equal(table(f.sqlite, "attempt_markers").length, 0); assert.equal(table(f.sqlite, "familiarity").length, 0);
    assert.equal(read(f.sqlite, "u", s.id).submitted.original, null);
    f.sqlite.prepare("DELETE FROM writing_sessions").run();
    assert.throws(() => commitPracticeCheckpoint(f.sqlite, "u", s, "acceptOriginal", s => save(f.sqlite, "u", s)), /no longer exists/);
    assert.equal(table(f.sqlite, "writing_sessions").length, 0);
  } finally { f.close(); }
});

test("migration scan is idempotent, preserves entire session table byte-for-byte, and marks all cutoff families unknown on unresolved history", () => {
  const f = fixture(); f.user("u", false);
  try {
    const finished = session(); finished.stage = "finished"; finished.submitted.original = finished.drafts.original; finished.evaluation = evaluation;
    const feedback = session(); feedback.stage = "feedback"; feedback.submitted.original = feedback.drafts.original; feedback.evaluation = evaluation;
    const unresolved = session(); unresolved.prompt.text = "An unreviewed historic task";
    const notInCatalog = session(); notInCatalog.prompt = { ...notInCatalog.prompt, id: "education", text: "Some people believe that university education should be free for all students. To what extent do you agree or disagree?" };
    for (const s of [finished, feedback, unresolved, notInCatalog]) save(f.sqlite, "u", s);
    const before = table(f.sqlite, "writing_sessions");
    const scan = scanLegacyUser(f.sqlite, "u", { now: time }); assert.equal(scan.unresolvedCount, 1);
    const facts = ["attempt_markers", "familiarity", "completion_events", "legacy_scan"].map(t => table(f.sqlite, t));
    scanLegacyUser(f.sqlite, "u", { now: later });
    assert.deepEqual(["attempt_markers", "familiarity", "completion_events", "legacy_scan"].map(t => table(f.sqlite, t)), facts);
    assert.deepEqual(table(f.sqlite, "writing_sessions"), before);
    assert.equal(table(f.sqlite, "completion_events").length, 1);
    assert.equal(table(f.sqlite, "completion_events")[0].completed_at, null);
    assert.equal(table(f.sqlite, "completion_events")[0].original_submitted_at, null);
    for (const q of catalog.questions) assert.equal(isExposureUnknown(f.sqlite, "u", q.exposureKey), true);
    const added = { ...catalog.questions[0], id: "new-id", exposureKey: "genuinely-new-family", bankOrder: 39, text: "A genuinely new task?" };
    importQuestions(f.sqlite, { ...catalog, bankVersion: "future-release", questions: [...catalog.questions, added] }, [...requirements, { ...requirements[0], id: added.id }]);
    assert.equal(isExposureUnknown(f.sqlite, "u", added.exposureKey), false);
    scanLegacyUser(f.sqlite, "u", { rescan: true });
    assert.equal(isExposureUnknown(f.sqlite, "u", added.exposureKey), false);
    assert.deepEqual(table(f.sqlite, "writing_sessions"), before);
  } finally { f.close(); }
});

test("alias ID/text conflict remains ambiguous even with one candidate and poisons cutoff exposure", () => {
  const f = fixture(); f.user("u", false);
  try {
    const s = session(); s.prompt.id = "education"; save(f.sqlite, "u", s);
    assert.equal(scanLegacyUser(f.sqlite, "u").unresolvedCount, 1);
    assert.equal(table(f.sqlite, "attempt_markers")[0].exposure_key, null);
    assert.equal(table(f.sqlite, "familiarity").length, 0);
    assert.equal(isExposureUnknown(f.sqlite, "u", catalog.questions[0].exposureKey), true);
  } finally { f.close(); }
});

test("new user has unresolved_count=0; unscanned or failed startup scan stays unknown and logs without blocking other users", () => {
  const f = fixture(); f.user("new"); f.user("broken", false); f.user("valid", false);
  try {
    assert.equal(table(f.sqlite, "legacy_scan")[0].unresolved_count, 0);
    assert.equal(isExposureUnknown(f.sqlite, "new", catalog.questions[0].exposureKey), false);
    assert.equal(isExposureUnknown(f.sqlite, "broken", catalog.questions[0].exposureKey), true);
    f.sqlite.prepare("INSERT INTO writing_sessions VALUES(?,?,?,?,?)").run("broken-session", "broken", "{invalid", time, time);
    const logs: string[] = [];
    assert.deepEqual(scanUnscannedUsers(f.sqlite, message => logs.push(message)), { succeeded: 1, failed: 1 });
    assert.equal(logs.length, 1); assert.match(logs[0], /exposure remains unknown/);
    assert.equal(isExposureUnknown(f.sqlite, "broken", catalog.questions[0].exposureKey), true);
    assert.equal(isExposureUnknown(f.sqlite, "valid", catalog.questions[0].exposureKey), false);
    assert.equal(table(f.sqlite, "attempt_markers").length, 0);
  } finally { f.close(); }
});

test("missing catalog cannot finalize legacy scan; unscanned acceptance is unknown then repeat", () => {
  const f = fixture(false); f.user("u", false);
  try {
    const s = session(); save(f.sqlite, "u", s);
    assert.throws(() => scanLegacyUser(f.sqlite, "u"), /Import the catalog/);
    importQuestions(f.sqlite, catalog, requirements);
    assert.equal(accept(f, s).originalFreshness, "unknown");
    assert.equal(accept(f, session()).originalFreshness, "repeat");
  } finally { f.close(); }
});

test("retained receipts are owner-scoped and immutable; conflicting parameters return 409; deletion markers are idempotent", () => {
  const f = fixture(); f.user(); f.user("other");
  try {
    const s = accept(f, session()); s.evaluation = evaluation; s.stage = "feedback";
    commitPracticeCheckpoint(f.sqlite, "u", s, "completeOriginal", s => save(f.sqlite, "u", s), time);
    const receipt = { userId: "u", idempotencyKey: "same-key", attemptId: s.id, action: "create", paramsHash: "hash", resultRef: s.id, createdAt: time };
    const first = writeRequestReceipt(f.sqlite, receipt);
    assert.deepEqual(writeRequestReceipt(f.sqlite, { ...receipt, resultRef: "ignored", createdAt: later }), first);
    assert.equal(getRequestReceipt(f.sqlite, "other", "same-key"), null);
    for (const changed of [{ paramsHash: "different" }, { action: "other" }, { attemptId: "other" }]) assert.throws(() => writeRequestReceipt(f.sqlite, { ...receipt, ...changed }), error => error instanceof ReceiptConflict && error.status === 409);
    writeRequestReceipt(f.sqlite, { ...receipt, userId: "other" });
    markPracticeDeleted(f.sqlite, "other", s.id, time); assert.equal(table(f.sqlite, "attempt_markers")[0].deleted_at, null);
    markPracticeDeleted(f.sqlite, "u", s.id, time); markPracticeDeleted(f.sqlite, "u", s.id, later);
    assert.equal(table(f.sqlite, "attempt_markers")[0].deleted_at, time);
    assert.equal(table(f.sqlite, "completion_events")[0].evidence_deleted, 1);
    assert.equal(table(f.sqlite, "completion_events")[0].freshness, "fresh");
  } finally { f.close(); }
});

test("invalid partial scoring output cannot satisfy the required-feedback contract or create a completion", async () => {
  const f = fixture(); f.user();
  try {
    const s = session(); save(f.sqlite, "u", s);
    const partial = { scores: evaluation.scores };
    await models([partial, partial], () => assert.rejects(runAction(s, { action: "evaluate", kind: "original" }, persistence(f))));
    assert.equal(table(f.sqlite, "completion_events").length, 0);
    assert.equal(read(f.sqlite, "u", s.id).stage, "evaluating");
    assert.equal(read(f.sqlite, "u", s.id).originalSubmittedAt, time);
  } finally { f.close(); }
});

test("unknown_time prior submission survives a new repeat; explicit rewrite records time and never claims freshness", () => {
  const f = fixture(); f.user();
  try {
    f.sqlite.prepare("INSERT INTO familiarity(user_id,exposure_key,first_attempt_id,deep_original_submitted) VALUES(?,?,?,?)").run("u", catalog.questions[0].exposureKey, "old", "unknown_time");
    const repeat = accept(f, session());
    assert.equal(repeat.originalFreshness, "repeat"); assert.equal(repeat.originalSubmittedAt, time);
    assert.equal(table(f.sqlite, "familiarity")[0].deep_original_submitted, "unknown_time");
    assert.equal(table(f.sqlite, "familiarity")[0].first_deep_original_at, null);
    const rewrite = session(); rewrite.prompt.text = catalog.questions[1].text; rewrite.rewriteOfDeepId = "source";
    assert.equal(accept(f, rewrite).originalFreshness, "repeat");
    assert.equal(rewrite.originalSubmittedAt, time);
    assert.equal(table(f.sqlite, "familiarity")[1].deep_original_submitted, "known");
    assert.equal(table(f.sqlite, "familiarity")[1].fresh_attempt_id, null);
  } finally { f.close(); }
});

test("deleted unresolved legacy evidence remains unknown on rescan; reviewed surviving aliases add positive facts without rewriting JSON", () => {
  const f = fixture(); f.user("u", false);
  try {
    const deleted = session(); deleted.prompt.text = "Unknown deleted historic task";
    const reviewed = session(); reviewed.prompt.text = "Unknown surviving historic task";
    for (const s of [deleted, reviewed]) save(f.sqlite, "u", s);
    assert.equal(scanLegacyUser(f.sqlite, "u").unresolvedCount, 2);
    markPracticeDeleted(f.sqlite, "u", deleted.id, time);
    f.sqlite.prepare("DELETE FROM writing_sessions WHERE id=?").run(deleted.id);
    f.sqlite.prepare("INSERT INTO question_aliases VALUES(?,?,?,?,?,?,?)").run("legacy-20261101-v1", "text", reviewed.prompt.text.toLowerCase(), "matched", catalog.questions[0].exposureKey, "test reviewer", "reviewed");
    const before = table(f.sqlite, "writing_sessions");
    assert.equal(scanLegacyUser(f.sqlite, "u", { rescan: true }).unresolvedCount, 1);
    assert.equal(isExposureUnknown(f.sqlite, "u", catalog.questions[0].exposureKey), true);
    assert.equal(table(f.sqlite, "attempt_markers").find(m => m.attempt_id === reviewed.id)!.exposure_key, catalog.questions[0].exposureKey);
    assert.equal(table(f.sqlite, "familiarity").length, 1);
    assert.deepEqual(table(f.sqlite, "writing_sessions"), before);
  } finally { f.close(); }
});

test("old finished regrade stays unknown-date even when startup scanning has not succeeded", () => {
  const f = fixture(); f.user("u", false);
  try {
    const s = session(); s.stage = "finished"; s.submitted.original = s.drafts.original; s.evaluation = evaluation; save(f.sqlite, "u", s);
    s.stage = "evaluating";
    commitPracticeCheckpoint(f.sqlite, "u", s, "acceptOriginal", s => save(f.sqlite, "u", s), time);
    const before = table(f.sqlite, "completion_events");
    assert.equal(before.length, 1); assert.equal(before[0].legacy, 1); assert.equal(before[0].completed_at, null);
    s.stage = "feedback"; s.evaluation = structuredClone(evaluation);
    s.evaluation.scores.rationale.TR = "未扫描旧记录的更新反馈";
    commitPracticeCheckpoint(f.sqlite, "u", s, "completeOriginal", s => save(f.sqlite, "u", s), time);
    const saved = read(f.sqlite, "u", s.id);
    assert.equal(saved.completedAt, null); assert.equal(saved.feedbackUpdatedAt, time);
    assert.equal(saved.originalSubmittedAt, null); assert.deepEqual(saved.evaluation, s.evaluation);
    assert.deepEqual(table(f.sqlite, "completion_events"), before);
    assert.equal(table(f.sqlite, "completion_events").filter(e => e.completed_at !== null).length, 0);
    assert.equal(table(f.sqlite, "legacy_scan").length, 0);
  } finally { f.close(); }
});

test("old accepted original retry before successful scan retains unknown time and blocks later fresh claims even if scoring fails", async () => {
  const f = fixture(); f.user("u", false);
  try {
    const s = session(); s.submitted.original = s.drafts.original; s.stage = "evaluating"; save(f.sqlite, "u", s);
    await models(["fail"], () => assert.rejects(runAction(s, { action: "evaluate", kind: "original" }, persistence(f))));
    assert.equal(read(f.sqlite, "u", s.id).originalSubmittedAt, null);
    assert.equal(table(f.sqlite, "familiarity")[0].deep_original_submitted, "unknown_time");
    assert.equal(accept(f, session()).originalFreshness, "repeat");
  } finally { f.close(); }
});
