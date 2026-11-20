import { topicLabels } from "../question-bank/labels";
import type { SessionState } from "../pipeline/types";

/** The topic a practice belongs to: the bank question's topic, or the topic chosen when the learner
 * pasted their own question. Null for older own questions saved without one. */
export function sessionTopic(session: Pick<SessionState, "question" | "prompt">): string | null {
  const topic = session.question?.primaryTopic ?? session.prompt.topicTags.find((tag) => tag in topicLabels);
  return topic && topic in topicLabels ? topic : null;
}
