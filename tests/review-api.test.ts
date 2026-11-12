import { inRequest } from "./helpers/request-context";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "../lib/db/client";
import { saveSession } from "../lib/db/queries/sessions";
import { userById } from "../lib/db/queries/users";
import { createSession } from "../lib/pipeline/initial";
import { POST } from "../app/api/review/route";
import { time } from "./helpers/practice-db";

const directory = mkdtempSync(join(tmpdir(), "opc-review-api-"));
process.env.DATABASE_PATH = join(directory, "test.db");
process.env.APP_ORIGIN = "http://review.test";
const db = getDb(); migrate(db, { migrationsFolder: resolve("drizzle") });
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
db.$client.prepare("INSERT INTO users(id,email,name,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)").run("u", "u@review.test", "u", "test", time, time);
db.$client.prepare("INSERT INTO auth_sessions VALUES(?,?,?)").run(digest(digest("u")), "u", Date.now() + 3600000);
after(() => { db.$client.close(); rmSync(directory, { recursive: true, force: true }); });

const session = createSession({ kind: "free", mode: "practice" });
session.submitted.original = "He go to school every day. The rent is expensive.";
session.evaluation = { scores: { overall: 6, dims: { TR: 6, CC: 6, LR: 6, GRA: 6 }, rationale: { TR: "", CC: "", LR: "", GRA: "" } },
  issues: [{ rank: 1, code: "sva", title: "主谓一致", why: "", sentenceIds: [1], hintL1: "先找主语", recurring: false }],
  review: { outlineCoverage: [], breakthrough: null, focusResult: null, selfReportContrast: null, aiRatio: 0 } };
saveSession("u", session);
const id = `fix:${session.id}:1`;

async function grade(body: Record<string, unknown>) {
  const request = new Request("http://review.test/api/review", { method: "POST", headers: { origin: "http://review.test", cookie: `wm_session=${digest("u")}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const response = await inRequest(request, () => POST(request));
  return { status: response.status, body: await response.json() };
}
const stored = () => JSON.parse(userById("u")!.profileJson).review[id];

test("评分响应丢失后重试同一次呈现：服务器只推进一次间隔，并告诉客户端当时记下的结果", async () => {
  const first = await grade({ id, result: "good", key: "shown-1" });
  assert.equal(first.status, 200);
  assert.equal(first.body.review.box, 1); assert.equal(first.body.replayed, false);
  const due = stored().due;
  const retry = await grade({ id, result: "good", key: "shown-1" });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.replayed, true); assert.equal(retry.body.review.box, 1);
  assert.equal(stored().box, 1, "one review, one step: 1 day, not 3"); assert.equal(stored().due, due);
  const changedButton = await grade({ id, result: "again", key: "shown-1" });
  assert.equal(changedButton.body.result, "good"); assert.equal(stored().box, 1);
  const nextTime = await grade({ id, result: "good", key: "shown-2" });
  assert.equal(nextTime.body.review.box, 2); assert.equal(stored().box, 2);
});

test("两个标签页交错评分（A、B、重放 A）：重放 A 不再推进，返回 A 当时的结果", async () => {
  const a = await grade({ id, result: "again", key: "tab-A" });
  assert.equal(a.body.review.box, 0);
  const b = await grade({ id, result: "good", key: "tab-B" });
  assert.equal(b.body.review.box, 1);
  const due = stored().due;
  const replay = await grade({ id, result: "good", key: "tab-A" });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.result, "again");
  assert.equal(stored().box, 1, "box stays 1, not 2"); assert.equal(stored().due, due);
});

test("没有呈现键的请求照常评分；未知条目 404", async () => {
  assert.equal((await grade({ id, result: "again" })).body.review.box, 0);
  assert.equal((await grade({ id: "fix:missing:1", result: "good", key: "k" })).status, 404);
});
