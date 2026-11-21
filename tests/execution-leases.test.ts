import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { after, test } from "node:test";
import { getSession, saveSession } from "../lib/db/queries/sessions";
import { admitModelCall, withModelAdmission } from "../lib/llm/admission";
import { ModelError } from "../lib/llm/json";
import { createSession } from "../lib/pipeline/initial";
import { isSessionBusy, withSessionLock } from "../lib/pipeline/lock";
import { quickFixture } from "./helpers/quick-api";

const fixture = quickFixture(), sqlite = fixture.db.$client;
after(() => fixture.close());

function worker(...args: string[]) {
  return fork(resolve("tests/helpers/execution-worker.ts"), args, {
    execArgv: ["--conditions=react-server", "--import", "tsx"],
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
}

async function recoverInAnotherProcess() {
  const child = worker("recover");
  const exited = once(child, "exit");
  try {
    assert.equal((await once(child, "message", { signal: AbortSignal.timeout(10_000) }))[0], "recovered");
    assert.deepEqual(await exited, [0, null]);
  } finally { if (child.exitCode === null) child.kill(); }
}

test("two processes share the session lock and model capacity and fence an expired writer", { timeout: 20_000 }, async () => {
  const state = createSession({ kind: "free", mode: "practice" });
  saveSession("u", state);
  const key = `u:${state.id}`;
  const child = worker("hold", "u", state.id);
  const exited = once(child, "exit");
  let releaseSlots!: () => void;
  const held = new Promise<void>(resolve => { releaseSlots = resolve; });
  const slots: Promise<void>[] = [];
  try {
    assert.equal((await once(child, "message", { signal: AbortSignal.timeout(10_000) }))[0], "ready");
    assert.equal(isSessionBusy(key), true);
    await assert.rejects(withSessionLock(key, () => assert.fail("overlapping lock")), error => !!error && typeof error === "object" && "status" in error && error.status === 409);
    await assert.rejects(withModelAdmission("u", async () => admitModelCall()), error => error instanceof ModelError && error.retryAfter === 5);
    for (let i = 0; i < 7; i++) slots.push(withModelAdmission(`other-${i}`, async () => { admitModelCall(); await held; }));
    await assert.rejects(withModelAdmission("ninth", async () => admitModelCall()), error => error instanceof ModelError && error.retryAfter === 15);
    sqlite.prepare("UPDATE execution_leases SET expires_at = 1 WHERE scope = 'session' AND key = ?").run(key);
    await withSessionLock(key, async () => {
      state.drafts.original = "new owner's draft";
      saveSession("u", state);
      const reply = once(child, "message", { signal: AbortSignal.timeout(10_000) });
      child.send("write");
      assert.equal((await reply)[0], "session_lease_expired");
      assert.equal(isSessionBusy(key), true, "an old owner cannot release the replacement lease");
    });
    assert.equal(getSession("u", state.id)?.drafts.original, "new owner's draft");
    await withModelAdmission("u", async () => admitModelCall());
  } finally {
    releaseSlots();
    await Promise.all(slots);
    if (child.exitCode === null) child.kill();
    await exited;
  }
});

test("another instance preserves live Quick work and only recovers orphaned operations and model reservations", { timeout: 30_000 }, async () => {
  const created = await fixture.call("create", "", { questionId: "qb_mock_health_001", activity: "quick", mode: "practice", idempotencyKey: crypto.randomUUID() });
  assert.equal(created.status, 201);
  const { id } = (await created.json()).session;
  const originalFetch = globalThis.fetch, oldKey = process.env.LLM_API_KEY;
  process.env.LLM_API_KEY = "offline-test";
  let modelCalled!: () => void, finishModel!: () => void;
  const called = new Promise<void>(resolve => { modelCalled = resolve; });
  const finish = new Promise<void>(resolve => { finishModel = resolve; });
  globalThis.fetch = async () => {
    modelCalled();
    await finish;
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"question":"为什么会产生这样的影响？","targetKey":null}' } }] });
  };
  const request = fixture.call("action", id, { action: "quickFollowup", cardVersion: 0, text: "这是我对题目的理解。", requestId: crypto.randomUUID() });
  const status = () => sqlite.prepare("SELECT status FROM quick_operations WHERE attempt_id = ?").pluck().get(id);
  const outcome = () => sqlite.prepare("SELECT outcome FROM llm_calls WHERE session_id = ?").pluck().get(id);
  try {
    await Promise.race([called, request.then(async response => assert.fail(await response.text()))]);
    await recoverInAnotherProcess();
    assert.equal(status(), "running");
    assert.equal(outcome(), "reserved");
    sqlite.exec("UPDATE execution_leases SET expires_at = 1 WHERE scope IN ('quick-operation', 'llm-call')");
    await recoverInAnotherProcess();
    assert.equal(status(), "indeterminate");
    assert.equal(outcome(), "indeterminate");
  } finally {
    finishModel();
    await request;
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = oldKey;
  }
  assert.deepEqual(getSession("u", id)?.messages.map(message => message.role), ["user"]);
  assert.equal(outcome(), "indeterminate");
});
