import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSession } from '../lib/pipeline/initial';
import { libraryEntryState, matchesEssayFilter } from '../lib/learning/library';

test('Persisted original feedback belongs to completed library before optional finish or revision',()=>{
 const session=createSession({kind:'free',mode:'practice'});session.stage='feedback';
 const row=libraryEntryState(session,true);
 assert.equal(row.statusLabel,'已完成');assert.equal(matchesEssayFilter(row,'done'),true);assert.equal(matchesEssayFilter(row,'active'),false);
 session.stage='revising';const revision=libraryEntryState(session,true);assert.equal(revision.statusLabel,'已完成 · 改写中');assert.equal(matchesEssayFilter(revision,'done'),true);
});
test('Unknown-date completion still belongs to completed; set-aside drafts remain only in all',()=>{
 const session=createSession({kind:'free',mode:'practice'});session.stage='finished';session.completedAt=null;
 assert.equal(matchesEssayFilter(libraryEntryState(session,true),'done'),true);
 session.stage='writing';session.lifecycle='set_aside';const row=libraryEntryState(session,false);
 assert.equal(matchesEssayFilter(row,'active'),false);assert.equal(matchesEssayFilter(row,'done'),false);assert.equal(matchesEssayFilter(row,'all'),true);assert.match(row.statusLabel,/已暂放/);
});
