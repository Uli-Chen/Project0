import { inRequest } from "./helpers/request-context";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { GET, PATCH } from "../app/api/sessions/[id]/route";
import { POST } from "../app/api/sessions/[id]/actions/route";
import { getDb } from "../lib/db/client";
import { authSessions, users, writingSessions } from "../lib/db/schema";
import { getSession, listSessions, saveSession } from "../lib/db/queries/sessions";
import { createSession } from "../lib/pipeline/initial";
import { readSession } from "../lib/pipeline/read-session";
import { withSessionLock } from "../lib/pipeline/lock";
import type { AgentAction } from "../lib/pipeline/schemas";
import { legacySession } from "./helpers/legacy-session";

const directory = mkdtempSync(join(tmpdir(), "opc-session-api-"));
process.env.DATABASE_PATH = join(directory, "test.db");
process.env.APP_ORIGIN = "http://session.test";
const db = getDb();
migrate(db, { migrationsFolder: resolve("drizzle") });
const token = "a".repeat(64);
const otherToken = "c".repeat(64);
const now = "2026-01-01T00:00:00.000Z";
db.insert(users).values({ id: "owner", name: "Test", email: "compat@example.test", passwordHash: "test-only", createdAt: now, updatedAt: now }).run();
db.insert(authSessions).values({ tokenHash: createHash("sha256").update(token).digest("hex"), userId: "owner", expiresAt: Date.now() + 60_000 }).run();
db.insert(users).values({ id: "other", name: "Other", email: "other@example.test", passwordHash: "test-only", createdAt: now, updatedAt: now }).run();
db.insert(authSessions).values({ tokenHash: createHash("sha256").update(otherToken).digest("hex"), userId: "other", expiresAt: Date.now() + 60_000 }).run();
after(() => { db.$client.close(); rmSync(directory, { recursive: true, force: true }); });

function insert(state: Record<string, unknown>) {
  const id = state.id as string;
  db.insert(writingSessions).values({ id, userId: "owner", stateJson: JSON.stringify(state), createdAt: now, updatedAt: now }).run();
  return id;
}
const rows = () => db.$client.prepare("SELECT * FROM writing_sessions ORDER BY id").all();
const raw = (id: string) => (db.$client.prepare("SELECT state_json FROM writing_sessions WHERE id = ?").get(id) as { state_json: string }).state_json;
async function call(id: string, method: "GET" | "PATCH" | "POST", body?: unknown, cookie = token) {
  const request = new Request(`http://session.test/api/sessions/${id}${method === "POST" ? "/actions" : ""}`, {
    method, headers: { origin: "http://session.test", "content-type": "application/json", cookie: `wm_session=${cookie}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return inRequest(request, () => (method === "GET" ? GET : method === "PATCH" ? PATCH : POST)(request, { params: Promise.resolve({ id }) }));
}

test("legacy get/list are read-only; real save upgrades to v2 and round-trips nested unknown fields", () => {
  const legacy = legacySession();
  const id = insert(legacy);
  const before = rows();
  const read = getSession("owner", id)!;
  assert.deepEqual(read, readSession(JSON.stringify(legacy)));
  assert.deepEqual(listSessions("owner").find(s => s.id === id), read);
  assert.deepEqual(rows(), before);
  assert.equal(read.schemaVersion, 1);
  saveSession("owner", read);
  const saved = getSession("owner", id)!;
  assert.deepEqual(saved, { ...readSession(JSON.stringify(legacy)), schemaVersion: 2 });
  assert.equal(readSession(raw(id)).schemaVersion, 2);
  assert.deepEqual(readSession(raw(id)), saved);
  const futureId = insert({ ...legacy, id: crypto.randomUUID(), schemaVersion: 3 });
  saveSession("owner", getSession("owner", futureId)!);
  assert.equal(readSession(raw(futureId)).schemaVersion, 3, "real saves must not downgrade a future schema");
});

const actions: AgentAction[] = [
  { action: "prewrite", text: "my idea" }, { action: "startWriting" },
  ...(["clarify", "polish", "check"] as const).map(action => ({ action, selection: "my text" })),
  { action: "express", text: "my idea" }, { action: "chat", text: "my idea" },
  { action: "suggestion", id: "s", status: "accepted" }, { action: "nudge", kind: "original", paragraphIndex: 0 },
  { action: "dismissNudge" }, { action: "evaluate", kind: "original" }, { action: "evaluate", kind: "revision" },
  { action: "startRevision" }, { action: "issue", rank: 1, intent: "more" }, { action: "finish" },
  { action: "rating", useful: 5, mine: "yes", comment: "saved" },
];
for (const [name, activity, stage] of [["Quick activity", "quick", "writing"], ["Quick stage", "deep", "quick"], ["unknown activity", "future", "writing"], ["unknown stage", "deep", "future"]]) {
  test(`${name}: GET succeeds; PATCH and every action reject with 409 and zero database changes`, async () => {
    const requestId = crypto.randomUUID();
    const id = insert({ ...createSession({ kind: "free", mode: "practice" }), activity, stage,
      lastWriteId: requestId, completedRequests: [requestId], future: { keep: [1, null] },
      pendingAction: { requestId: "old-pending", input: { action: "evaluate", kind: "original" }, startedAt: now },
    });
    const before = rows();
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => { assert.fail("unsupported sessions must never call a model"); };
    try {
      const response = await call(id, "GET");
      assert.equal(response.status, 200);
      assert.equal((await response.json()).session.activity, activity);
      const bodies = [{ version: 0, requestId, drafts: { original: "overwrite", revision: "" } }, { version: 999 }, { futurePatch: true }];
      for (const body of bodies) {
        const response = await call(id, "PATCH", body);
        assert.equal(response.status, 409);
        assert.equal((await response.json()).code, "unsupported_session");
        assert.deepEqual(rows(), before);
      }
      for (const input of [...actions, { action: "futureAction" }]) {
        const response = await call(id, "POST", { ...input, requestId });
        assert.equal(response.status, 409, input.action);
        assert.equal((await response.json()).code, "unsupported_session", input.action);
        assert.deepEqual(rows(), before, input.action);
      }
      await withSessionLock(`owner:${id}`, async () => {
        for (const method of ["PATCH", "POST"] as const) {
          const response = await call(id, method, {});
          assert.equal(response.status, 409);
          assert.equal((await response.json()).code, "unsupported_session");
        }
      });
      assert.deepEqual(rows(), before);
    } finally { globalThis.fetch = previousFetch; }
  });
}

test("legacy and Deep GET, editing, actions and idempotency retain existing behavior", async () => {
  for (const state of [legacySession(), { ...createSession({ kind: "free", mode: "practice" }) }]) {
    const id = insert(state);
    const before = rows();
    assert.equal((await call(id, "GET")).status, 200);
    assert.deepEqual(rows(), before);
    const outline = createSession({ kind: "free", mode: "practice" }).outline;
    outline.stance = { text: "Updated stance", sources: ["user"] };
    const requestId = crypto.randomUUID();
    const patch = { version: 0, requestId, drafts: { original: "My saved draft.", revision: "" }, outline, elapsed: { original: 15, revision: 0 }, nudgesEnabled: false };
    const response = await call(id, "PATCH", patch);
    assert.equal(response.status, 200);
    const saved = (await response.json()).session;
    assert.equal(saved.schemaVersion, 2);
    assert.equal(saved.version, 1);
    assert.equal(saved.drafts.original, patch.drafts.original);
    assert.equal(saved.outline.stance.text, "Updated stance");
    if (!("schemaVersion" in state)) {
      const legacy = state as ReturnType<typeof legacySession>;
      assert.deepEqual(saved.futureData, legacy.futureData);
      assert.deepEqual(saved.prompt, legacy.prompt);
      assert.deepEqual(saved.outline.futureOutline, [1, { keep: true }]);
      assert.deepEqual(saved.outline.stance.futureSlot, { keep: 7 });
      assert.equal(saved.outline.counter.futureCounter, true);
      assert.equal(saved.outline.reasons[0].futureReason, "keep");
      assert.deepEqual(saved.drafts.futureDraft, { text: "保留草稿" });
      assert.equal(saved.elapsed.futureElapsed, 17);
    }
    const afterPatch = rows();
    assert.equal((await call(id, "PATCH", patch)).status, 200);
    assert.deepEqual(rows(), afterPatch);
    const actionId = crypto.randomUUID();
    const action = await call(id, "POST", { action: "startWriting", requestId: actionId });
    assert.equal(action.status, 200);
    const written = (await action.json()).session;
    assert.equal(written.stage, "writing");
    assert.equal(written.drafts.original, patch.drafts.original);
    assert.deepEqual(written.outline, saved.outline);
    const afterAction = rows();
    assert.equal((await call(id, "POST", { action: "startWriting", requestId: actionId })).status, 200);
    assert.deepEqual(rows(), afterAction);
    assert.equal((await call(id, "PATCH", { version: 0 })).status, 409);
    assert.deepEqual(rows(), afterAction);
  }
});

test("unsupported guard preserves authentication, origin checking and owner isolation", async () => {
  const id = insert({ ...createSession({ kind: "free", mode: "practice" }), activity: "quick" });
  const before = rows();
  assert.equal((await call(id, "PATCH", {}, "b".repeat(64))).status, 401);
  assert.equal((await call(id, "GET", undefined, otherToken)).status, 404);
  assert.equal((await call(id, "PATCH", {}, otherToken)).status, 404);
  assert.equal((await call(id, "POST", {}, otherToken)).status, 404);
  assert.equal((await call("not-owned", "PATCH", {})).status, 404);
  assert.equal((await call("not-owned", "POST", {})).status, 404);
  const request = new Request(`http://session.test/api/sessions/${id}`, { method: "PATCH", headers: { origin: "http://foreign.test", cookie: `wm_session=${token}` } });
  assert.equal((await inRequest(request, () => PATCH(request, { params: Promise.resolve({ id }) }))).status, 403);
  assert.deepEqual(rows(), before);
});
