import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptQuickSnapshot, createIntentLatch, unchangedDraft, persistedIntentKey } from '../lib/quick/client-state';
const snapshot = (version: number, contentVersion = version) => ({ session: { version }, card: { contentVersion } });
test('Delayed GET before save cannot roll back saved card; same-version operation results invalidate pending reads', () => {
 assert.equal(acceptQuickSnapshot(snapshot(3), snapshot(2), {epoch:1,sequence:5}, {epoch:2,sequence:4}), false);
 assert.equal(acceptQuickSnapshot(snapshot(3), snapshot(3), {epoch:1,sequence:9}, {epoch:2,sequence:8}), false);
 assert.equal(acceptQuickSnapshot(snapshot(3), snapshot(3), {epoch:2,sequence:8}, {epoch:2,sequence:9}), false);
 assert.equal(acceptQuickSnapshot(snapshot(3), snapshot(2), {epoch:2,sequence:10}, {epoch:2,sequence:9}), false);
 assert.equal(acceptQuickSnapshot(snapshot(3), snapshot(4,2), {epoch:2,sequence:10}, {epoch:2,sequence:9}), false);
 assert.equal(acceptQuickSnapshot(snapshot(3), snapshot(3), {epoch:2,sequence:10}, {epoch:2,sequence:9}), true);
});
test('Double-click synchronous intent latch and edits during pending save prevent duplicate dispatch/navigation', () => {
 const latch=createIntentLatch();assert.equal(latch.enter(),true);assert.equal(latch.enter(),false);assert.equal(latch.busy,true);
 assert.equal(unchangedDraft(4,3),false);assert.equal(unchangedDraft(3,3),true);
 latch.leave();assert.equal(latch.enter(),true);
});
test('Explicit-new lost response followed by refresh reuses persisted intent; storage denial has memory fallback', () => {
 const map=new Map<string,string>();const storage={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v);}};
 let allocations=0;const create=()=>`intent-${++allocations}`;
 assert.equal(persistedIntentKey(storage,'attempt-a',create),'intent-1');
 assert.equal(persistedIntentKey(storage,'attempt-a',create),'intent-1');
 assert.equal(allocations,1);
 assert.equal(persistedIntentKey(storage,'attempt-b',create),'intent-2');
 assert.equal(persistedIntentKey({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}},'attempt-c',create),'intent-3');
});
