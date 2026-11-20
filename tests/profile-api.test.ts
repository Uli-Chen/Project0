import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { inRequest } from "./helpers/request-context";
import { getDb } from "../lib/db/client";
import { authSessions, users } from "../lib/db/schema";
import { PATCH } from "../app/api/profile/route";

const directory = mkdtempSync(join(tmpdir(), "opc-profile-"));
process.env.DATABASE_PATH = join(directory, "test.db");
process.env.APP_ORIGIN = "http://profile.test";
const db = getDb(); migrate(db, { migrationsFolder: resolve("drizzle") });
const now = "2026-11-01T00:00:00.000Z";
const ended = { target: "6.5", timeBy: "weeks", examDate: "2026-11-01", weeks: "", level: "6 左右", perWeek: "3", minutes: "45", difficulties: ["语法错误多"], lang: "zh", onboardingCompleted: true };
db.insert(users).values({ id: "u", email: "u@test.test", name: "u", passwordHash: "test", createdAt: now, updatedAt: now, profileJson: JSON.stringify(ended) }).run();
db.insert(authSessions).values({ tokenHash: createHash("sha256").update("a".repeat(64)).digest("hex"), userId: "u", expiresAt: Date.now() + 86_400_000 }).run();
after(() => { db.$client.close(); rmSync(directory, { recursive: true, force: true }); });

function patch(body: unknown) {
  const request = new Request("http://profile.test/api/profile", { method: "PATCH", headers: { origin: "http://profile.test", cookie: `wm_session=${"a".repeat(64)}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  return inRequest(request, () => PATCH(request));
}

test("an ended weeks plan kept unchanged can still be saved with other settings; a new past date is refused", async () => {
  const kept = await patch({ ...ended, target: "7" });
  assert.equal(kept.status, 200, await kept.clone().text());
  const saved = (await kept.json()).user.profile;
  assert.equal(String(saved.target), "7.0"); assert.equal(saved.examDate, "2026-11-01");
  const moved = await patch({ ...ended, examDate: "2026-10-01" });
  assert.equal(moved.status, 400);
});

test("the goal form needs only the target, the exam time and the weekly count", async () => {
  const goal = { target: "7.0", timeBy: "weeks", weeks: "8", examDate: "", perWeek: "3", explainLanguage: "zh", onboardingCompleted: true };
  db.update(users).set({ profileJson: "{}" }).run();
  const saved = await patch(goal);
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.equal((await saved.json()).user.profile.explainLanguage, "zh");
  db.update(users).set({ profileJson: "{}" }).run();
  assert.equal((await patch({ ...goal, perWeek: undefined })).status, 400);
  db.update(users).set({ profileJson: "{}" }).run();
  assert.equal((await patch({ ...goal, weeks: "" })).status, 400);
});
