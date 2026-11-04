import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, readdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pruneBackups } from "../lib/db/backup-retention";
import { privacyNotice } from "../lib/privacy/notice";
import { profilePatchSchema } from "../lib/auth/validation";
import { publicUser } from "../lib/db/queries/users";

test("backup retention deletes only expired own regular files, never arbitrary files or symlinks", async () => {
 const dir = await mkdtemp(join(tmpdir(), "tutor-backups-"));
 const old = "2026-01-01T00-00-00.000Z-12345678-1234-1234-1234-123456789abc.db";
 const recent = "2026-11-03T00-00-00.000Z-12345678-1234-1234-1234-123456789abc.db";
 const link = "2025-01-01T00-00-00.000Z-12345678-1234-1234-1234-123456789abc.db";
 try {
  await Promise.all([old, recent, "important.db"].map(n => writeFile(join(dir,n), "keep")));
  await symlink(join(dir,"important.db"),join(dir,link));
  assert.equal(await pruneBackups(dir, undefined),0);
  await assert.rejects(pruneBackups(dir,"-1"));
  assert.equal(await pruneBackups(dir,"30",Date.parse("2026-11-03T12:00:00Z")),1);
  assert.deepEqual((await readdir(dir)).sort(),[recent,link,"important.db"].sort());
 } finally { await rm(dir,{recursive:true,force:true}); }
});
test("privacy page excludes maintenance notes and appendices but keeps publication blockers", () => {
 const text=privacyNotice();
 assert.match(text,/AI 调用内容/); assert.match(text,/【待定/);
 assert.doesNotMatch(text,/维护说明|附录（维护用|说法与代码依据/);
});
test("new preference validation and effective values preserve unknown stored fields", () => {
 assert.equal(profilePatchSchema.safeParse({explainLanguage:"fr"}).success,false);
 assert.equal(profilePatchSchema.safeParse({explainLanguage:null,nudgesDefault:false}).success,true);
 for(const [stored,effective] of [[null,"en"],["en","en"],["zh","zh"],["future","en"]] as const) {
  const row={id:"u",email:"u@test.invalid",name:"U",passwordHash:"x",createdAt:"now",updatedAt:"now",profileJson:JSON.stringify({explainLanguage:stored,nudgesDefault:false,extra:"keep"})};
  const before=row.profileJson; assert.equal(publicUser(row).profile.explainLanguage,effective);
  assert.equal(publicUser(row).profile.nudgesDefault,false); assert.equal(row.profileJson,before);
 }
});
