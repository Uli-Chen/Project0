import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Real local integration test. Calls the configured model and retains a review
// account. Private credentials and resume checkpoints are ignored by Git.
const base = process.env.TEST_BASE_URL ?? "http://localhost:3100";
const directory = resolve("artifacts/private/round1");
await mkdir(directory, { recursive: true });
const checkpointPath = resolve(directory, "learning-checkpoint.json");
let record;
try { record = JSON.parse(await readFile(checkpointPath, "utf8")); }
catch { record = { base, email: `round1-${randomUUID().slice(0, 8)}@example.test`, password: `Round1-${randomUUID()}`, name: "林初 · Round 1", results: {} }; }
assert.equal(record.base, base, "Use a separate checkpoint for another server");
const save = () => writeFile(checkpointPath, JSON.stringify(record, null, 2), { mode: 0o600 });

async function request(path, method = "GET", body, expected = 200) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { Origin: base, "Content-Type": "application/json", ...(record.cookie ? { Cookie: record.cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(290000),
  });
  const cookie = response.headers.getSetCookie().find(value => value.startsWith("wm_session="));
  if (cookie) record.cookie = cookie.split(";")[0];
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify({ error: data.error, stage: data.session?.stage })}`);
  return data;
}

async function step(name, run) {
  if (record.results[name]) { console.log(`RESUME ${name}`); return record.results[name].data; }
  console.log(`START ${name}`);
  const start = Date.now();
  let data;
  try { data = await run(); }
  catch (error) {
    record.failures ??= [];
    record.failures.push({ name, at: new Date().toISOString(), milliseconds: Date.now() - start, error: error.message });
    await save();
    throw error;
  }
  record.results[name] = { milliseconds: Date.now() - start, at: new Date().toISOString(), data: data ?? true };
  await save();
  console.log(`PASS ${name} (${record.results[name].milliseconds}ms)`);
  return data;
}
const getSession = async id => (await request(`/api/sessions/${id}`)).session;
const action = async (id, input) => (await request(`/api/sessions/${id}/actions`, "POST", { requestId: randomUUID(), ...input })).session;
const draft = async (id, kind, text) => {
  const current = await getSession(id);
  return (await request(`/api/sessions/${id}`, "PATCH", { version: current.version, drafts: { ...current.drafts, [kind]: text } })).session;
};

const essay = `Working from home has become increasingly common as digital technology improves. I believe its advantages outweigh its disadvantages, provided employers give workers the right support. It can reduce wasted travel time and widen access to jobs, although communication may become more difficult.

The main advantage is that remote work saves time. A worker who previously spent an hour travelling each way can use that time for rest, exercise or family activities. For example, a parent can collect a child from school without leaving the office unusually early. This flexibility may reduce stress and help employees concentrate during their working hours. However, saved time does not automatically lead to greater productivity. Workers still need a quiet place and a clear schedule, otherwise household distractions can interrupt their tasks.

Another benefit is access to employment. People living outside expensive cities can apply for jobs without moving away from their communities. A small software company, for instance, can employ a skilled programmer who lives in a rural town. The employee avoids high housing costs, while the company gains expertise that may be unavailable locally. This arrangement is especially useful for jobs that mainly require a computer, but it cannot replace workplaces such as hospitals or factories.

The biggest disadvantage is weaker communication between colleagues. New employees may struggle to ask informal questions, and written messages can be misunderstood. Companies can address this problem by arranging short regular meetings and assigning a colleague to support each newcomer. Occasional office days could also help teams build trust.

In conclusion, working from home offers substantial benefits through reduced commuting and broader employment opportunities. Its communication problems are real, but a carefully organised combination of remote work and face-to-face contact can limit them.`;

await step("register-new-profile", () => request("/api/auth/register", "POST", { name: record.name, email: record.email, password: record.password }, 201));
await request("/api/auth/login", "POST", { email: record.email, password: record.password });
await save();
await step("new-account-is-empty", async () => {
  assert.equal((await request("/api/sessions")).sessions.length, 0);
  assert.equal((await request("/api/profile")).user.profile.onboardingCompleted, false);
});
await step("save-and-reload-onboarding", async () => {
  await request("/api/profile", "PATCH", { target: "6.5", timeBy: "weeks", weeks: "8", examDate: "", level: "6 左右", perWeek: "3", minutes: "45", difficulties: ["想法说不清", "语法错误多"], lang: "zh", onboardingCompleted: true });
  assert.equal((await request("/api/profile")).user.profile.target, "6.5");
});
const task = "Many people now work from home using modern technology. Do the advantages of this trend outweigh the disadvantages?";
const assessment = await step("create-assessment", async () => {
  const { session } = await request("/api/sessions", "POST", { kind: "assessment", mode: "mock", prompt: task }, 201);
  assert.equal(session.stage, "writing"); return { id: session.id };
});
await step("reject-empty-and-mock-coaching", async () => {
  await request(`/api/sessions/${assessment.id}/actions`, "POST", { action: "evaluate", kind: "original" }, 400);
  await request(`/api/sessions/${assessment.id}/actions`, "POST", { action: "chat", text: "Write my essay" }, 400);
});
await step("save-assessment-and-reject-stale-write", async () => {
  const saved = await draft(assessment.id, "original", essay);
  assert.equal((await getSession(assessment.id)).drafts.original, essay);
  await request(`/api/sessions/${assessment.id}`, "PATCH", { version: saved.version - 1, drafts: { original: "stale text", revision: "" } }, 409);
  assert.equal((await getSession(assessment.id)).drafts.original, essay);
});
await step("real-assessment-evaluation", async () => {
  const session = await action(assessment.id, { action: "evaluate", kind: "original" });
  assert.equal(session.stage, "feedback"); assert.ok(session.evaluation.scores.overall >= 0);
  return { scores: session.evaluation.scores, issues: session.evaluation.issues };
});
await step("real-assessment-finish", async () => {
  const session = await action(assessment.id, { action: "finish" });
  assert.equal(session.stage, "finished"); return session.finish;
});
const practice = await step("create-independent-practice", async () => {
  const { session } = await request("/api/sessions", "POST", { kind: "task", mode: "practice", prompt: task }, 201);
  assert.notEqual(session.id, assessment.id); return { id: session.id };
});
await step("real-prewriting-and-idempotent-replay", async () => {
  const body = { action: "prewrite", text: "我认为居家办公利大于弊。首先它节省通勤时间，让家长有时间照顾孩子。第二，它让小城市的人也能申请大公司的岗位。缺点是新人很难获得即时帮助，可以每周安排短会和导师。", requestId: randomUUID() };
  const first = (await request(`/api/sessions/${practice.id}/actions`, "POST", body)).session;
  const replay = (await request(`/api/sessions/${practice.id}/actions`, "POST", body)).session;
  assert.equal(replay.messages.length, first.messages.length); assert.equal(replay.prewriteTurns, 1);
  assert.ok(first.outline.stance); return { outline: first.outline, reply: first.messages.at(-1).content };
});
await step("start-writing-and-save", async () => {
  await action(practice.id, { action: "startWriting" });
  await draft(practice.id, "original", essay.replace("Its communication problems are real", "Its communication problems is real"));
});
for (const input of [
  { action: "chat", text: "我的文章是否每个主体段都只有一个明确重点？请简短回答。" },
  { action: "clarify", selection: "However, saved time does not automatically lead to greater productivity." },
  { action: "check", selection: "Its communication problems is real, but a carefully organised combination of remote work and face-to-face contact can limit them." },
  { action: "polish", selection: "The main advantage is that remote work saves time." },
  { action: "express", text: "如何简洁表达：面对面交流能够减少误解，但不一定需要每天到办公室。" },
  { action: "nudge", kind: "original", paragraphIndex: 1 },
]) await step(`real-${input.action}`, async () => {
  const session = await action(practice.id, input);
  return { reply: session.messages.at(-1)?.content, suggestions: Object.values(session.suggestions), nudge: session.nudge };
});
await step("real-practice-evaluation", async () => {
  const session = await action(practice.id, { action: "evaluate", kind: "original" });
  assert.equal(session.stage, "feedback"); return session.evaluation;
});
await step("real-issue-guidance", async () => {
  const session = await getSession(practice.id);
  assert.ok(session.evaluation.issues.length, "A grammar error should produce feedback");
  const next = await action(practice.id, { action: "issue", rank: session.evaluation.issues[0].rank, intent: "more" });
  return next.messages.at(-1).content;
});
await step("revision-validates-change", async () => {
  await action(practice.id, { action: "startRevision" });
  await request(`/api/sessions/${practice.id}/actions`, "POST", { action: "evaluate", kind: "revision" }, 400);
  await draft(practice.id, "revision", essay.replace("Companies can address this problem by arranging short regular meetings and assigning a colleague to support each newcomer.", "Companies can address this problem by arranging a short daily question session and assigning an experienced colleague to each newcomer. For example, a new employee could discuss an unclear instruction with that colleague before beginning a task, preventing several hours of avoidable rework."));
});
await step("real-revision-evaluation-and-comparison", async () => {
  const session = await action(practice.id, { action: "evaluate", kind: "revision" });
  assert.equal(session.stage, "compared");
  assert.equal(session.comparison.issues.length, session.evaluation.issues.length);
  return { scores: session.revisionScores, comparison: session.comparison };
});
await step("persist-rating-and-finish", async () => {
  await action(practice.id, { action: "rating", useful: 4, mine: "yes", comment: "Round 1 integration review" });
  const session = await action(practice.id, { action: "finish" });
  assert.equal(session.stage, "finished"); assert.equal(session.rating.useful, 4); return session.finish;
});
await step("authenticated-pages-render", async () => {
  for (const path of ["/", "/plan", "/memory", "/progress", "/account", "/onboarding", `/sessions/${practice.id}`]) {
    const response = await fetch(`${base}${path}`, { headers: { Cookie: record.cookie }, signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200, path); const html = await response.text();
    assert.equal(html.includes("NEXT_HTTP_ERROR_FALLBACK;500"), false, path);
    assert.ok(html.includes("<!DOCTYPE html>"), path);
  }
});
console.log(`COMPLETE ${Object.keys(record.results).length} learning scenario checks. Retained profile: ${record.email}. Private checkpoint: ${checkpointPath}`);
