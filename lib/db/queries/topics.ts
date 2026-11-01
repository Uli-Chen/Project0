import 'server-only';
import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { questions, completionEvents, familiarity, defaultContinuations, topicCards, attemptMarkers } from '../schema';
import { listSessions } from './sessions';
import { readFeatures } from '../../config/features';
import { recommendInTopic, resumeAttempt, type AttemptView } from '../../rules/recommend';
import { practiceCounts } from '../../rules/practice';
export function getTopicData(userId: string, topic?: string, now = new Date()) {
 const db = getDb();
 const bank = db.select().from(questions).where(eq(questions.isCurrent, true)).all().sort((a,b) => a.bankOrder-b.bankOrder);
 const completions = db.select().from(completionEvents).where(eq(completionEvents.userId,userId)).all();
 const cards = db.select().from(topicCards).where(eq(topicCards.userId,userId)).all();
 const markers = db.select().from(attemptMarkers).where(eq(attemptMarkers.userId,userId)).all();
 const attempts: AttemptView[] = listSessions(userId).map(s => ({ id:s.id, questionId:s.question?.id ?? null, exposureKey:s.question?.exposureKey ?? markers.find(m=>m.attemptId===s.id)?.exposureKey ?? null, activity:s.activity, lifecycle:s.lifecycle, createdAt:s.createdAt, lastStudentActionAt:s.lastStudentActionAt, completed:completions.some(c=>c.attemptId===s.id), activeRevision:['revising','re_evaluating'].includes(s.stage), cardState:cards.find(c=>c.attemptId===s.id)?.state, hasCard:cards.some(c=>c.attemptId===s.id) }));
 const topics = [...new Set(bank.map(q=>q.primaryTopic))].map(name => {
  const events = completions.filter(c=>c.primaryTopic===name && c.questionId);
  const completed = new Set(events.map(c=>c.exposureKey));
  const started = markers.filter(m=>m.primaryTopic===name && m.questionId);
  const currentCards = cards.filter(c=>bank.some(q=>q.id===c.questionId && q.primaryTopic===name));
  return { topic:name, completed:completed.size, startedOnly:new Set(started.filter(m=>!completed.has(m.exposureKey)).map(m=>m.exposureKey)).size, passedCards:currentCards.filter(c=>c.state==='passed').length, draftCards:currentCards.filter(c=>c.state!=='passed').length, lastPractisedAt:[...started.map(m=>m.createdAt), ...attempts.filter(a=>bank.some(q=>q.id===a.questionId && q.primaryTopic===name)).map(a=>a.lastStudentActionAt)].filter((date): date is string => !!date).sort().at(-1) ?? null };
 });
 const flags = readFeatures();
 // A return visit/edit is practice too; creation-only ordering points users back
 // to a newer abandoned topic instead of the one they just worked on.
 const lastTopic = markers.filter(m=>m.primaryTopic && m.questionId).map(marker => {
  const attempt = attempts.find(a=>a.id===marker.attemptId);
  return { topic: marker.primaryTopic, at: attempt?.lastStudentActionAt ?? marker.createdAt ?? '', id: marker.attemptId };
 }).sort((a,b)=>b.at.localeCompare(a.at) || a.id.localeCompare(b.id))[0]?.topic ?? null;
 return { topics, questions:bank.filter(q=>!topic||q.primaryTopic===topic), attempts, completions, counts:practiceCounts(completions,now), resume:resumeAttempt(attempts,flags.QUICK_ENABLED) ?? null, lastTopic, recommendation:topic ? recommendInTopic({ topic, questions:bank, attempts, completions, familiarity:db.select().from(familiarity).where(eq(familiarity.userId,userId)).all(), continuations:db.select().from(defaultContinuations).where(eq(defaultContinuations.userId,userId)).all(), quickEnabled:flags.QUICK_ENABLED }) : null };
}
