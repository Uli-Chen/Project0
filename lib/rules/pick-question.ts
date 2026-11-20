import type { AttemptView, CompletionView, QuestionView } from './recommend';

export type QuestionPick = { questionId: string; reason: 'first' | 'rarest_type' | 'new_topic' | 'next' | 'rewrite' };

const open = (a: AttemptView) => a.lifecycle === 'open' && (a.activity === 'quick' ? a.cardState !== 'passed' : !a.completed);

/** 推荐一题: one practice question across the whole bank, chosen for coverage. Skips questions with
 * work in progress; prefers questions without an essay, then the least practised question type, then
 * the least practised topic. When every question has an essay, the one written longest ago. */
export function pickQuestion(questions: QuestionView[], completions: CompletionView[], attempts: AttemptView[]): QuestionPick | null {
  const pool = questions.filter((q) => q.pool === 'practice' && !attempts.some((a) => a.exposureKey === q.exposureKey && open(a)));
  const practised = completions.filter((c) => c.exposureKey && (c.activity === 'quick' || c.completedAt));
  const essays = (q: QuestionView) => completions.filter((c) => c.exposureKey === q.exposureKey && c.activity === 'deep' && c.completedAt);
  const typeCount = (type: string) => practised.filter((c) => c.questionType === type).length;
  const topicCount = (topic: string) => practised.filter((c) => c.primaryTopic === topic).length;
  const fresh = pool.filter((q) => !essays(q).length);
  if (!fresh.length) {
    const oldest = pool.sort((a, b) => essays(a).map((c) => c.completedAt!).sort()[0].localeCompare(essays(b).map((c) => c.completedAt!).sort()[0]) || a.bankOrder - b.bankOrder)[0];
    return oldest ? { questionId: oldest.id, reason: 'rewrite' } : null;
  }
  const q = fresh.sort((a, b) => typeCount(a.questionType) - typeCount(b.questionType) || topicCount(a.primaryTopic) - topicCount(b.primaryTopic) || a.bankOrder - b.bankOrder)[0];
  const types = new Set(questions.map((x) => x.questionType));
  const reason = !practised.length ? 'first'
    : typeCount(q.questionType) < Math.max(...[...types].map(typeCount)) ? 'rarest_type'
    : topicCount(q.primaryTopic) === 0 ? 'new_topic'
    : 'next';
  return { questionId: q.id, reason };
}
