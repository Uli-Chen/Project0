export type QuestionView = { id: string; exposureKey: string; primaryTopic: string; questionType: string; bankOrder: number; pool: string };
export type CompletionView = { attemptId: string; activity: string; exposureKey: string | null; questionId?: string | null; primaryTopic: string | null; questionType: string | null; completedAt: string | null; evidenceDeleted?: boolean };
export type AttemptView = { id: string; questionId: string | null; exposureKey: string | null; activity: string; lifecycle: string; createdAt: string; lastStudentActionAt: string | null; completed: boolean; activeRevision: boolean; cardState?: string; hasCard?: boolean };
export type ReasonParts = { branch: 'untouched' | 'fallback' | 'exhausted'; leastPractisedType: boolean };
export type Recommendation = { kind: 'resume'; attemptId: string } | { kind: 'empty'; reason: 'no_practice_questions' | 'only_saved_or_unavailable_work' } | { kind: 'rewrite'; questionId: string; rewriteOfDeepId: string; sourceDeleted: boolean; reason: ReasonParts } | { kind: 'new'; questionId: string; activity: 'quick' | 'deep'; continueFromQuickId: string | null; needsExplicitNew: boolean; focus: null; reason: ReasonParts };
export type RecommendInput = { topic: string; questions: QuestionView[]; attempts: AttemptView[]; completions: CompletionView[]; familiarity: { exposureKey: string }[]; continuations: { quickAttemptId: string; deepAttemptId: string }[]; quickEnabled: boolean; focusEnabled?: boolean; focusEvidence?: unknown; excludedCodes?: string[] };
export const studentOrder = (a: AttemptView, b: AttemptView) => (b.lastStudentActionAt || b.createdAt).localeCompare(a.lastStudentActionAt || a.createdAt) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
const needsWork = (a: AttemptView) => a.activity === 'quick' ? a.cardState !== 'passed' : !a.completed;
export function resumeAttempt(attempts: AttemptView[], quickEnabled: boolean) { return attempts.filter(a => a.lifecycle === 'open' && (a.activity !== 'quick' || quickEnabled) && needsWork(a)).sort(studentOrder)[0]; }
/** RFC §6: terminal question branches, family exclusion, then activity/type selection. */
export function recommendInTopic(input: RecommendInput): Recommendation {
 const p = input.questions.filter(q => q.primaryTopic === input.topic && q.pool === 'practice');
 const ids = new Set(p.map(q => q.id));
 const attempts = input.attempts.filter(a => a.questionId && ids.has(a.questionId) && (a.activity !== 'quick' || input.quickEnabled));
 const resume = resumeAttempt(attempts, input.quickEnabled);
 if (resume) return { kind: 'resume', attemptId: resume.id };
 if (!p.length) return { kind: 'empty', reason: 'no_practice_questions' };
 const blocked = (q: QuestionView) => input.attempts.some(a => a.exposureKey === q.exposureKey && a.lifecycle !== 'closed' && (a.activity !== 'quick' || input.quickEnabled) && (needsWork(a) || a.activeRevision));
 const deep = (q: QuestionView) => input.completions.filter(c => c.exposureKey === q.exposureKey && c.activity === 'deep' && c.completedAt).sort((a,b) => b.completedAt!.localeCompare(a.completedAt!) || a.attemptId.localeCompare(b.attemptId));
 if (p.every(q => deep(q).length)) {
  const q = p.filter(q => !blocked(q)).sort((a,b) => deep(a)[0].completedAt!.localeCompare(deep(b)[0].completedAt!) || a.bankOrder-b.bankOrder)[0];
  if (!q) return { kind: 'empty', reason: 'only_saved_or_unavailable_work' };
  const latest = deep(q)[0];
  return { kind: 'rewrite', questionId: q.id, rewriteOfDeepId: latest.attemptId, sourceDeleted: !!latest.evidenceDeleted, reason: { branch: 'exhausted', leastPractisedType: false } };
 }
 let candidates = p.filter(q => !blocked(q) && !input.familiarity.some(f => f.exposureKey === q.exposureKey));
 const branch = candidates.length ? 'untouched' : 'fallback';
 if (!candidates.length) candidates = p.filter(q => !blocked(q) && !deep(q).length);
 const typeCount = (type: string) => new Set(input.completions.filter(c => c.questionType === type && c.exposureKey).map(c => c.exposureKey)).size;
 candidates.sort((a,b) => typeCount(a.questionType)-typeCount(b.questionType) || a.bankOrder-b.bankOrder);
 const q = candidates[0];
 if (!q) return { kind: 'empty', reason: 'only_saved_or_unavailable_work' };
 const practised = input.completions.some(c => c.primaryTopic === input.topic && (c.activity === 'quick' || c.activity === 'deep' && c.completedAt));
 const activity = input.quickEnabled && !practised ? 'quick' : 'deep';
 const card = activity === 'deep' && input.quickEnabled ? input.attempts.filter(a => a.exposureKey === q.exposureKey && a.hasCard).sort(studentOrder)[0] : undefined;
 const mapping = card && input.continuations.find(c => c.quickAttemptId === card.id);
 const child = mapping && input.attempts.find(a => a.id === mapping.deepAttemptId);
 return { kind: 'new', questionId: q.id, activity, continueFromQuickId: card?.id ?? null, needsExplicitNew: !!mapping && (!child || child.lifecycle === 'closed' && !child.completed), focus: null, reason: { branch, leastPractisedType: true } };
}
