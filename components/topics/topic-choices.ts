import { questionTypeLabels, topicLabels } from '@/lib/question-bank/labels';
import type { getTopicData } from '@/lib/db/queries/topics';
import type { TopicChoice } from '@/components/topics/topic-picker';

export const TYPE_COUNT = Object.keys(questionTypeLabels).length;

/** Every topic with its progress: questions done, question types practised (a completed essay or a
 * passed card), cards and when it was last practised. */
export function topicChoices(data: ReturnType<typeof getTopicData>, current: string | null): TopicChoice[] {
  const practised = data.completions.filter((c) => c.activity === 'quick' || c.completedAt);
  return data.topics.map((t) => ({
    topic: t.topic,
    label: topicLabels[t.topic] ?? t.topic,
    completed: t.completed,
    total: t.total,
    startedOnly: t.startedOnly,
    cards: t.passedCards,
    lastPractisedAt: t.lastPractisedAt,
    types: new Set(practised.filter((c) => c.primaryTopic === t.topic).map((c) => c.questionType).filter(Boolean)).size,
    typeCount: TYPE_COUNT,
    current: t.topic === current,
  }));
}
