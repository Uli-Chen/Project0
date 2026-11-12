import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptQuickSnapshot, createIntentLatch, unchangedDraft, persistedIntentKey, QUICK_STARTERS, ASK_LIMIT, placeable, validateAsk, askDelivered, echoText, planAsk, settleAsk, reconcileAsk, answerDelivered, stableRequestId, coachBottom, mergeCard, mergeSnapshot, unsentCoachText, restoreInto, withoutDelivered, type PendingAsk, type Outcome } from '../lib/quick/client-state';
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

/* Speak-first coach: send, reconcile and resend decisions (astra acceptance r1 items 1, 2, 5, 6, 8). */
const ids = () => { let n = 0; return () => `id-${++n}`; };
const said = (content: string, action = 'quickAsk') => ({ id: `m-${content}`, role: 'user', stage: 'quick', action, content });
const coachQ = (content = '你身边有谁离家上学？') => ({ id: 'q', role: 'coach', stage: 'quick', action: 'quickFollowup', content });
const ok: Outcome = { ok: true };
const lost: Outcome = { ok: false, code: null, message: '连接超时，内容还在本页。', uncertain: true };
const refused = (code: string, message = '拒绝'): Outcome => ({ ok: false, code, message, uncertain: false });
const typed = (text: string) => ({ text, typed: true }), starter = (text: string) => ({ text, typed: false });

test('optimistic bubble shows while sending and disappears once the polled snapshot has the ask; failure rolls it back', () => {
 const { request } = planAsk(null, '我想从独立说起', 3, 1, ids());
 assert.equal(echoText(request, [said('早先的一句')]), '我想从独立说起');
 // The same text said before the send point is not this ask.
 assert.equal(echoText(request, [said('我想从独立说起')]), '我想从独立说起');
 assert.equal(echoText(request, [said('早先的一句'), said('我想从独立说起')]), null);
 assert.equal(echoText({ ...request, status: 'failed' }, []), null);
 assert.equal(echoText(null, []), null);
});
test('a lost response keeps the ask pending for an unchanged replay; typed text returns to the box, a starter does not touch the draft', () => {
 const { request } = planAsk(null, '我想从独立说起', 3, 0, ids());
 const t = settleAsk(request, lost, typed('我想从独立说起'), []);
 assert.deepEqual(t.pending, { ...request, status: 'failed' }); assert.equal(t.restore, '我想从独立说起'); assert.equal(t.refresh, true); assert.ok(t.error);
 const s = settleAsk({ ...request, text: QUICK_STARTERS[0] }, lost, starter(QUICK_STARTERS[0]), []);
 assert.equal(s.pending?.text, QUICK_STARTERS[0]); assert.equal(s.pending?.status, 'failed'); assert.equal(s.restore, null);
 const definitive = settleAsk(request, refused('quota_exhausted'), typed('我想从独立说起'), []);
 assert.equal(definitive.pending?.requestId, request.requestId); assert.equal(definitive.refresh, false);
});
test('resend replays the full pending request unchanged, even after a card edit or with other text; success starts fresh', () => {
 const next = ids();
 const first = planAsk(null, '我想从独立说起', 3, 0, next).request;
 const failed: PendingAsk = { ...first, status: 'failed' };
 const again = planAsk(failed, '我想从独立说起', 4, 2, next);
 assert.equal(again.replay, true); assert.deepEqual(again.request, { ...first, status: 'sending' });
 const other = planAsk(failed, '换一个想法', 4, 2, next);
 assert.deepEqual(other.request, { ...first, status: 'sending' });
 // The replay landed; the different new text is not sent and goes back into the ask box.
 const done = settleAsk(other.request, ok, typed('换一个想法'), []);
 assert.deepEqual([done.pending, done.restore, done.error], [null, '换一个想法', null]);
 assert.equal(planAsk(done.pending, '换一个想法', 4, 2, next).request.requestId, 'id-2');
 assert.equal(settleAsk(again.request, ok, typed('我想从独立说起'), []).restore, null);
 // The 重新发送 button replays the failed ask; once delivered, the copy that was put back in the box must go.
 const resent = settleAsk(again.request, ok, starter('我想从独立说起'), []);
 assert.deepEqual([resent.pending, resent.restore, resent.clear], [null, null, '我想从独立说起']);
 assert.equal(t_clearOnFailure(), null);
});
function t_clearOnFailure() { return settleAsk({ text: 'x', cardVersion: 1, requestId: 'r', after: 0, status: 'sending' }, lost, typed('x'), []).clear; }
test('card_conflict on a replay means it never reached the server: a new intent with the current version', () => {
 const failed: PendingAsk = { text: '我想从独立说起', cardVersion: 3, requestId: 'old', after: 0, status: 'failed' };
 const s = settleAsk({ ...failed, status: 'sending' }, refused('card_conflict'), typed('我想从独立说起'), []);
 assert.deepEqual([s.pending, s.newIntent, s.error], [null, true, null]);
 const fresh = planAsk(s.pending, '我想从独立说起', 5, 0, () => 'new').request;
 assert.deepEqual([fresh.requestId, fresh.cardVersion], ['new', 5]);
});
test('followup_pending, followup_unfinished and idempotency_conflict drop the request id; the thread conflicts refresh', () => {
 const sending: PendingAsk = { text: '我想从独立说起', cardVersion: 3, requestId: 'r', after: 0, status: 'sending' };
 for (const code of ['followup_pending', 'followup_unfinished']) {
  const s = settleAsk(sending, refused(code, '请先回答教练的上一个问题。'), typed(sending.text), []);
  assert.deepEqual([s.pending, s.refresh, s.restore, s.newIntent], [null, true, sending.text, false], code); assert.ok(s.error);
 }
 const c = settleAsk(sending, refused('idempotency_conflict'), typed(sending.text), []);
 assert.deepEqual([c.pending, c.refresh, c.restore], [null, false, sending.text]);
 assert.notEqual(planAsk(c.pending, sending.text, 3, 0, () => 'fresh').request.requestId, 'r');
});
test('A1: polling shows the ask and the coach question, then the POST is lost: the ask is done and nothing is left to send as an answer', () => {
 const { request } = planAsk(null, '我不知道怎么展开', 3, 0, ids());
 const polled = [said('我不知道怎么展开'), coachQ()];
 const s = settleAsk(request, lost, typed('我不知道怎么展开'), polled);
 assert.deepEqual([s.pending, s.restore, s.error, s.refresh], [null, null, null, false]);
 // The response was lost before any poll: the text goes back, then the refreshed snapshot settles it.
 const early = settleAsk(request, lost, typed('我不知道怎么展开'), []);
 assert.equal(early.restore, '我不知道怎么展开');
 assert.deepEqual(reconcileAsk(early.pending, '我不知道怎么展开', polled), { pending: null, askDraft: '' });
 // Something else the student typed meanwhile stays.
 assert.deepEqual(reconcileAsk(early.pending, '另一句', polled), { pending: null, askDraft: '另一句' });
 // Not yet in the snapshot, or still in flight: unchanged.
 assert.deepEqual(reconcileAsk(early.pending, 'x', [said('别的')]), { pending: early.pending, askDraft: 'x' });
 assert.deepEqual(reconcileAsk(request, 'x', polled), { pending: request, askDraft: 'x' });
 assert.equal(askDelivered(request, polled), true);
});
test('an answer whose response was lost is recognised under the same question only', () => {
 const messages = [coachQ(), { role: 'user', stage: 'quick', action: 'quickAnswer', replyToMessageId: 'q', content: '我表哥' }];
 assert.equal(answerDelivered({ text: '我表哥 ', questionId: 'q' }, messages), true);
 assert.equal(answerDelivered({ text: '我表哥', questionId: 'other' }, messages), false);
 const a = stableRequestId(null, 'q\n我表哥', ids());
 assert.equal(stableRequestId(a, 'q\n我表哥', () => 'x'), a); assert.notEqual(stableRequestId(a, 'q\n别的', () => 'x').id, a.id);
});
test('bottom area order, including follow-up quota 1 -> 0 after a successful ask', () => {
 assert.equal(coachBottom({ pendingAnswer: false, followupStuck: false, followupsLeft: 1 }), 'ask');
 assert.equal(coachBottom({ pendingAnswer: true, followupStuck: false, followupsLeft: 0 }), 'answer');
 assert.equal(coachBottom({ pendingAnswer: false, followupStuck: false, followupsLeft: 0 }), 'used_up');
 assert.equal(coachBottom({ pendingAnswer: false, followupStuck: true, followupsLeft: 0 }), 'stuck');
 assert.equal(coachBottom({ pendingAnswer: false, followupStuck: false, followupsLeft: null }), 'ask');
});
test('starter clicks are excluded from 放进卡片 (all four); typed asks and answers are not', () => {
 assert.equal(QUICK_STARTERS.length, 4);
 for (const text of QUICK_STARTERS) assert.equal(placeable(said(text)), false, text);
 assert.equal(placeable(said('我觉得离家上学能锻炼独立')), true);
 assert.equal(placeable(said(QUICK_STARTERS[3], 'quickAnswer')), true);
 assert.equal(placeable(coachQ()), false);
});
test('asks are limited to 1,000 characters after trimming; blank is ignored silently', () => {
 assert.deepEqual(validateAsk(`  ${'问'.repeat(ASK_LIMIT)}  `), { ok: true, text: '问'.repeat(ASK_LIMIT) });
 const over = validateAsk('问'.repeat(ASK_LIMIT + 1)); assert.equal(over.ok, false); assert.match(over.ok ? '' : over.error ?? '', /1,000/);
 assert.deepEqual(validateAsk(' \n '), { ok: false, error: null });
});
test('three-way card merge: remote where untouched, local where the server is untouched, conflicts where both changed', () => {
 const keys = ['a', 'b', 'c', 'd', 'e'];
 const base = { a: '旧', b: '旧', c: '旧', d: '旧', e: '旧' };
 const local = { a: '旧', b: '我改的', c: '我改的', d: '一样', e: '旧 ' };
 const remote = { a: '他改的', b: '旧', c: '他改的', d: '一样', e: '旧' };
 const { draft, conflicts } = mergeCard(keys, base, local, remote);
 assert.deepEqual(draft, { a: '他改的', b: '我改的', c: '我改的', d: '一样', e: '旧 ' });
 assert.deepEqual(conflicts, { c: { mine: '我改的', theirs: '他改的' } });
 // Our own save still in flight shows up as remote: not a conflict with what we typed since.
 assert.deepEqual(mergeCard(['b'], { b: '旧' }, { b: '我改的，还在写' }, { b: '我改的' }, { b: '我改的' }).conflicts, {});
 // A field cleared elsewhere counts as a change.
 assert.deepEqual(mergeCard(['a'], { a: '旧' }, { a: '旧' }, {}).draft, { a: '' });
});

/* Astra r2 #1: every snapshot, POST responses included, goes through the three-way merge. */
const card = (version: number, texts: Record<string, string>) => ({ version, texts });
const fields = ['cause', 'effect'];
test('an answer response carrying another tab\'s card edit merges it in, so the next autosave cannot write the stale draft back', () => {
 // This page: card empty and untouched. Another tab saved; the quickAnswer response carries version 2.
 const remote = card(2, { cause: '他写的原因' });
 const merged = mergeSnapshot(fields, card(1, {}), remote, {}, { sent: null });
 assert.ok(merged); assert.equal(merged.changed, true); assert.equal(merged.fresh, false);
 assert.deepEqual(merged.draft, { cause: '他写的原因' }); assert.deepEqual(merged.conflicts, {});
 // The draft now equals the saved card: nothing left for autosave to send.
 assert.ok(fields.every(k => (merged.draft[k] ?? '') === (remote.texts[k as 'cause'] ?? '')));
 // Same version (an answer that touched no card): nothing to merge.
 assert.equal(mergeSnapshot(fields, card(2, { cause: 'x' }), card(2, { cause: 'x' }), { cause: 'y' }, {}), null);
});
test('a followup response with another tab\'s edit keeps local typing elsewhere and reports a real conflict', () => {
 const base = card(3, { cause: '旧原因', effect: '旧影响' });
 const local = { cause: '我在改原因', effect: '旧影响' };
 const quiet = mergeSnapshot(fields, base, card(4, { cause: '旧原因', effect: '他改的影响' }), local, { sent: null });
 assert.deepEqual(quiet?.draft, { cause: '我在改原因', effect: '他改的影响' }); assert.deepEqual(quiet?.conflicts, {});
 const clash = mergeSnapshot(fields, base, card(4, { cause: '他改的原因', effect: '旧影响' }), local, { sent: null });
 assert.deepEqual(clash?.draft, local); assert.equal(clash?.fresh, true);
 assert.deepEqual(clash?.conflicts, { cause: { mine: '我在改原因', theirs: '他改的原因' } });
 // A conflict the new snapshot settles (the draft now matches it) is dropped.
 assert.deepEqual(mergeSnapshot(fields, base, card(5, { cause: '我在改原因', effect: '旧影响' }), local, {}, { cause: { mine: '我在改原因', theirs: '旧的他' } })?.conflicts, {});
});
test('our own cardSave response is not another tab\'s edit: typing since the send stays, no conflict', () => {
 const base = card(1, { cause: '旧', effect: '旧影响' });
 const merged = mergeSnapshot(fields, base, card(2, { cause: '我改的', effect: '旧影响' }), { cause: '我改的，还在写', effect: '旧影响' }, { sent: { cause: '我改的', effect: '旧影响' } });
 assert.deepEqual([merged?.changed, merged?.fresh, merged?.conflicts], [false, false, {}]);
 assert.deepEqual(merged?.draft, { cause: '我改的，还在写', effect: '旧影响' });
 // A receipt replay of that save answering with a later card: the other tab's field is merged in.
 const replay = mergeSnapshot(fields, base, card(3, { cause: '我改的', effect: '他改的影响' }), { cause: '我改的', effect: '旧影响' }, { sent: { cause: '我改的', effect: '旧影响' } });
 assert.deepEqual([replay?.draft, replay?.conflicts], [{ cause: '我改的', effect: '他改的影响' }, {}]);
});
test('an excerpt fills its field from its own response; typing in that field meanwhile wins without a conflict', () => {
 const base = card(1, { cause: '', effect: '旧影响' });
 assert.deepEqual(mergeSnapshot(fields, base, card(2, { cause: '我表哥', effect: '旧影响' }), { cause: '', effect: '旧影响' }, { wrote: ['cause'] })?.draft, { cause: '我表哥', effect: '旧影响' });
 const typedMeanwhile = mergeSnapshot(fields, base, card(2, { cause: '我表哥', effect: '旧影响' }), { cause: '刚打的', effect: '旧影响' }, { wrote: ['cause'] });
 assert.deepEqual([typedMeanwhile?.draft.cause, typedMeanwhile?.conflicts], ['刚打的', {}]);
});

/* Astra r2 #2: an ask that left the box is protected until the server confirms it. */
test('leaving needs a decision for unsent answers, ask text, and an ask still saving or in flight; not after it is confirmed', () => {
 const none = { answer: '', askDraft: '', preparingAsk: false, pendingAsk: null };
 assert.equal(unsentCoachText(none), false);
 assert.equal(unsentCoachText({ ...none, answer: '我表哥' }), true);
 assert.equal(unsentCoachText({ ...none, askDraft: '我想从独立说起' }), true);
 assert.equal(unsentCoachText({ ...none, askDraft: ' \n ' }), false);
 // The box cleared on send; the card is being saved before the ask goes out.
 assert.equal(unsentCoachText({ ...none, preparingAsk: true }), true);
 // The ask request is in flight.
 assert.equal(unsentCoachText({ ...none, pendingAsk: { status: 'sending' } }), true);
 // Failed: a typed ask is back in the box, which protects it; the failed request alone does not.
 assert.equal(unsentCoachText({ ...none, pendingAsk: { status: 'failed' }, askDraft: '我想从独立说起' }), true);
 assert.equal(unsentCoachText({ ...none, pendingAsk: { status: 'failed' } }), false);
});

test('restoring an unsent ask keeps what the student typed meanwhile', () => {
 assert.equal(restoreInto('', '我想从独立说起'), '我想从独立说起');
 assert.equal(restoreInto('新的想法', '我想从独立说起'), '我想从独立说起\n新的想法');
 assert.equal(restoreInto('我想从独立说起', '我想从独立说起'), '我想从独立说起');
 // Restoring twice does not stack copies.
 assert.equal(restoreInto(restoreInto('新的想法', 'A'), 'A'), 'A\n新的想法');
});

test('once a restored ask is delivered, only its copy leaves the box and newer text stays', () => {
 assert.equal(withoutDelivered('A', 'A'), '');
 assert.equal(withoutDelivered(restoreInto('B', 'A'), 'A'), 'B');
 // Edited by the student: the draft is theirs now and stays as it is.
 assert.equal(withoutDelivered('A 改过了\nB', 'A'), 'A 改过了\nB');
 assert.equal(withoutDelivered('B', 'A'), 'B');
 assert.equal(reconcileAsk({ text: 'A', cardVersion: 1, requestId: 'r', after: 0, status: 'failed' }, 'A\nB', [{ id: 'm', role: 'user', stage: 'quick', action: 'quickAsk', content: 'A' }] as never).askDraft, 'B');
});
