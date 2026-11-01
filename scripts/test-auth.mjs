import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Run against a development or deployed server. All created accounts are deleted.
const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const otherScheme = new URL(base);
otherScheme.protocol = otherScheme.protocol === "https:" ? "http:" : "https:";
const password = `Test-${randomUUID()}`;
const nextPassword = `Changed-${randomUUID()}`;
const suffix = randomUUID().slice(0, 8);
const accounts = ["a", "b"].map((letter) => ({ email: `auth-test-${suffix}-${letter}@example.test`, name: `Auth test ${letter}`, password, cookie: "" }));
let checked = 0;

async function request(path, { method = "GET", body, cookie = "", origin = base, headers = {} } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(method === "GET" ? {} : { Origin: origin }), ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  const sessionCookie = response.headers.getSetCookie().find((header) => header.startsWith("wm_session="));
  return { response, data, cookie: sessionCookie?.split(";")[0] ?? cookie };
}

function status(result, expected, label) {
  assert.equal(result.response.status, expected, `${label}: ${JSON.stringify(result.data)}`);
  checked += 1;
}

try {
  status(await request("/api/auth/me"), 401, "anonymous access");
  status(await request("/api/auth/register", { method: "POST", body: { name: "x", email: accounts[0].email, password }, origin: "https://attacker.example" }), 403, "cross-origin registration");
  status(await request("/api/auth/register", { method: "POST", body: { name: "x", email: accounts[0].email, password }, origin: otherScheme.origin }), 403, "cross-scheme registration");
  status(await request("/api/auth/register", { method: "POST", body: { name: "x", email: accounts[0].email, password: "short" } }), 400, "weak password");
  for (const account of accounts) {
    const registered = await request("/api/auth/register", { method: "POST", body: { name: account.name, email: account.email.toUpperCase(), password } });
    status(registered, 201, "register");
    assert.equal(registered.data.user.email, account.email);
    assert.equal(registered.data.user.profile.onboardingCompleted, false);
    assert.equal("passwordHash" in registered.data.user, false);
    assert.match(registered.response.headers.get("set-cookie"), /httponly/i);
    assert.match(registered.response.headers.get("set-cookie"), /samesite=lax/i);
    if (base.startsWith("https:")) assert.match(registered.response.headers.get("set-cookie"), /;\s*secure(?:;|$)/i);
    account.cookie = registered.cookie;
  }
  const [a, b] = accounts;
  const concurrentPasswords = [`Race-a-${randomUUID()}`, `Race-b-${randomUUID()}`];
  const racingChanges = await Promise.all(concurrentPasswords.map((newPassword) => request("/api/auth/password", { method: "POST", cookie: b.cookie, body: { currentPassword: password, newPassword } })));
  const winners = racingChanges.map((result, index) => ({ result, index })).filter(({ result }) => result.response.status === 200);
  assert.equal(winners.length, 1, "only one concurrent password rotation may succeed");
  b.password = concurrentPasswords[winners[0].index]; b.cookie = winners[0].result.cookie;
  assert.ok(racingChanges.some((result) => [401, 409].includes(result.response.status)), "stale password mutation is rejected");
  checked += 1;
  status(await request("/api/auth/register", { method: "POST", body: { name: "duplicate", email: a.email, password } }), 409, "duplicate account");
  status(await request("/api/auth/login", { method: "POST", body: { email: a.email, password: "wrong-password" } }), 401, "wrong password");
  status(await request("/api/profile", { method: "PATCH", cookie: a.cookie, body: { onboardingCompleted: true } }), 400, "incomplete profile");
  const profile = { target: 7, timeBy: "weeks", weeks: 8, level: "未考过", perWeek: 3, minutes: 45, difficulties: ["没想法"], lang: "zh", onboardingCompleted: true };
  const saved = await request("/api/profile", { method: "PATCH", cookie: a.cookie, body: profile });
  status(saved, 200, "save profile");
  assert.equal(saved.data.user.profile.target, "7.0");
  assert.equal((await request("/api/profile", { cookie: b.cookie })).data.user.profile.onboardingCompleted, false);
  const created = await request("/api/sessions", { method: "POST", cookie: a.cookie, body: { kind: "free", mode: "mock" } });
  status(created, 201, "create writing session");
  const id = created.data.session.id;
  status(await request(`/api/sessions/${id}`, { cookie: b.cookie }), 404, "cross-account session read");
  status(await request(`/api/sessions/${id}`, { method: "PATCH", cookie: b.cookie, body: { version: 0, drafts: { original: "stolen", revision: "" } } }), 404, "cross-account session write");
  status(await request(`/api/sessions/${id}`, { method: "DELETE", cookie: b.cookie }), 404, "cross-account session delete");
  assert.equal((await request("/api/sessions", { cookie: b.cookie })).data.sessions.length, 0);
  status(await request(`/api/sessions/${id}`, { method: "PATCH", cookie: a.cookie, body: { version: created.data.session.version, drafts: { original: "My own saved draft.", revision: "" } } }), 200, "save own draft");
  assert.equal((await request(`/api/sessions/${id}`, { cookie: a.cookie })).data.session.drafts.original, "My own saved draft.");
  const oldCookie = a.cookie;
  const changed = await request("/api/auth/password", { method: "POST", cookie: a.cookie, body: { currentPassword: password, newPassword: nextPassword } });
  status(changed, 200, "change password");
  a.cookie = changed.cookie; a.password = nextPassword;
  status(await request("/api/auth/me", { cookie: oldCookie }), 401, "old session revoked");
  status(await request("/api/auth/login", { method: "POST", body: { email: a.email, password } }), 401, "old password rejected");
  status(await request("/api/auth/account", { method: "DELETE", cookie: a.cookie, body: { password: nextPassword, confirmation: "incorrect" } }), 400, "deletion confirmation");
  const relogin = await request("/api/auth/login", { method: "POST", body: { email: a.email, password: nextPassword } });
  status(relogin, 200, "login with new password");
  a.cookie = relogin.cookie;
  assert.equal((await request(`/api/sessions/${id}`, { cookie: a.cookie })).data.session.drafts.original, "My own saved draft.");
  const loggedOut = a.cookie;
  status(await request("/api/auth/logout", { method: "POST", cookie: a.cookie }), 200, "logout");
  status(await request("/api/auth/me", { cookie: loggedOut }), 401, "logout revocation");
  a.cookie = (await request("/api/auth/login", { method: "POST", body: { email: a.email, password: nextPassword } })).cookie;
  for (let attempt = 0; attempt < 13; attempt++) {
    const limited = await request("/api/auth/login", { method: "POST", body: { email: `limit-${suffix}@example.test`, password }, headers: { "x-forwarded-for": `203.0.113.${attempt + 1}`, "x-real-ip": `203.0.113.${attempt + 1}` } });
    status(limited, attempt < 12 ? 401 : 429, "spoofed client IP cannot bypass account limit");
  }
  console.log(`PASS: ${checked} authentication, profile, isolation, and persistence checks.`);
} finally {
  for (const account of accounts) {
    if (!account.cookie) continue;
    const deleted = await request("/api/auth/account", { method: "DELETE", cookie: account.cookie, body: { password: account.password, confirmation: "删除我的账户" } });
    assert.equal(deleted.response.status, 200, "test account cleanup");
    status(await request("/api/auth/me", { cookie: account.cookie }), 401, "deleted account session");
  }
}
