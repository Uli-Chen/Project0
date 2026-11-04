import assert from 'node:assert/strict';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {readFileSync,readdirSync} from 'node:fs';
test('T1 additive migration preserves reserved old rows and existing CHECK constraints',()=>{
 const db=new Database(':memory:');
 try {
  const files=readdirSync('drizzle').filter(f=>/^\d+.*\.sql$/.test(f)).sort();
  for(const f of files.filter(f=>f<'0007'))db.exec(readFileSync(`drizzle/${f}`,'utf8'));
  db.prepare('INSERT INTO users(id,email,name,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('u','x@t.test','x','x','now','now');
  db.exec("INSERT INTO llm_calls(id,user_id,purpose,attempt,model,config_version,started_at,reserved_input,reserved_output,reserved_ms,outcome) VALUES('old','u','scoring',1,'old','old','now',1,2,3,'reserved')");
  const before=db.prepare('SELECT * FROM llm_calls').get() as Record<string,unknown>;
  const oldSql=(db.prepare("SELECT sql FROM sqlite_master WHERE name='llm_calls'").get() as {sql:string}).sql;
  db.exec(readFileSync('drizzle/0007_keen_sentinels.sql','utf8'));
  const after=db.prepare('SELECT * FROM llm_calls').get() as Record<string,unknown>;
  for(const [key,value] of Object.entries(before))assert.equal(after[key],value,key);
  for(const key of Object.keys(after).filter(key=>!(key in before)))assert.equal(after[key],null,key);
  const newSql=(db.prepare("SELECT sql FROM sqlite_master WHERE name='llm_calls'").get() as {sql:string}).sql;
  for(const constraint of oldSql.match(/CONSTRAINT[^\n]+/g)??[])assert.ok(newSql.includes(constraint));
 }finally{db.close()}
});
