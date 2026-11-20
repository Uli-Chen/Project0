import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickQuestion } from '../lib/rules/pick-question';
import type { AttemptView, CompletionView, QuestionView } from '../lib/rules/recommend';

const question = (id: string, primaryTopic: string, questionType: string, bankOrder: number, pool = 'practice'): QuestionView => ({ id, exposureKey: `f-${id}`, primaryTopic, questionType, bankOrder, pool });
const bank = [question('a', 'education', 'agree', 1), question('b', 'education', 'weigh', 2), question('c', 'work', 'weigh', 3), question('r', 'health', 'solve', 0, 'checkpoint_reserved')];
const essay = (id: string, completedAt: string, extra: Partial<CompletionView> = {}): CompletionView => ({ attemptId: `done-${id}-${completedAt}`, activity: 'deep', exposureKey: `f-${id}`, primaryTopic: bank.find((q) => q.id === id)!.primaryTopic, questionType: bank.find((q) => q.id === id)!.questionType, completedAt, ...extra });
const attempt = (id: string, extra: Partial<AttemptView> = {}): AttemptView => ({ id: `att-${id}`, questionId: id, exposureKey: `f-${id}`, activity: 'deep', lifecycle: 'open', createdAt: '2026-11-01', lastStudentActionAt: null, completed: false, activeRevision: false, ...extra });

test('a new learner gets the first practice question by bank order, never a reserved one', () => {
  assert.deepEqual(pickQuestion(bank, [], []), { questionId: 'a', reason: 'first' });
});

test('after practice the least practised question type comes first, then the least practised topic', () => {
  // Both remaining questions are an unpractised type; the one in an unpractised topic wins.
  assert.deepEqual(pickQuestion(bank, [essay('a', '2026-11-02')], []), { questionId: 'c', reason: 'rarest_type' });
  // Types are now even, so the reason is the new topic.
  assert.deepEqual(pickQuestion(bank, [essay('a', '2026-11-02'), essay('b', '2026-11-03')], []), { questionId: 'c', reason: 'new_topic' });
  assert.deepEqual(pickQuestion(bank, [essay('a', '2026-11-02'), essay('c', '2026-11-03')], []), { questionId: 'b', reason: 'next' });
});

test('work in progress is skipped, and with every question written the oldest essay is rewritten', () => {
  assert.equal(pickQuestion(bank, [], [attempt('a')])!.questionId, 'b');
  assert.equal(pickQuestion(bank, [], [attempt('a', { activity: 'quick', cardState: 'passed' })])!.questionId, 'a');
  const all = [essay('a', '2026-11-05'), essay('b', '2026-11-02'), essay('c', '2026-11-04')];
  assert.deepEqual(pickQuestion(bank, all, []), { questionId: 'b', reason: 'rewrite' });
  assert.equal(pickQuestion(bank, all, [attempt('a'), attempt('b'), attempt('c')]), null);
});
