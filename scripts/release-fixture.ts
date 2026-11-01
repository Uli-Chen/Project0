// Disposable local acceptance environment only; never points to an application database.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createServer } from "node:http";
import { getDb } from "../lib/db/client";
import { users } from "../lib/db/schema";
import { hashPassword } from "../lib/auth/password";
import { importQuestions } from "../lib/db/import-questions";
import { markNewUserScanned } from "../lib/db/migrate-0.4";
import { readFileSync } from "node:fs";

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "opc-release-"));
  process.env.DATABASE_PATH = join(dir, "app.db");
  const db = getDb(); migrate(db, { migrationsFolder: resolve("drizzle") });
  importQuestions(db.$client, JSON.parse(readFileSync("data/question-bank/question_bank.mock.json", "utf8")), JSON.parse(readFileSync("data/question-bank/requirements.mock.json", "utf8")));
  const now = new Date().toISOString();
  db.insert(users).values({ id: "release-test", email: "release@example.test", name: "验收测试", passwordHash: await hashPassword("Release-test-2026!"), createdAt: now, updatedAt: now }).run();
  markNewUserScanned(db.$client, "release-test", now);
  writeFileSync("/tmp/opc-release-env.json", JSON.stringify({ database: process.env.DATABASE_PATH, email: "release@example.test", password: "Release-test-2026!" }));
  db.$client.close();
  createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body);
    const content = payload.messages.map((m: { content: string }) => m.content).join("\n");
    let output: unknown;
    if (content.includes("Ask exactly one focused")) output = { question: "为什么这个因素会影响个人的选择？", targetKey: null };
    else {
      const context = JSON.parse(payload.messages[1].content);
      output = { results: context.requirements.map((r: { id: string }) => ({ id: r.id, status: content.includes("充分说明") ? "met" : "gap", note: content.includes("充分说明") ? null : "请解释原因与结果的联系" })) };
    }
    setTimeout(() => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 200, completion_tokens: 100 } })); }, 2500);
  }).listen(4312, "127.0.0.1", () => console.log(`Fixture ready: ${dir}; fake provider 127.0.0.1:4312`));
}
void main();
