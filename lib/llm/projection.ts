import type { CoachMessage } from "../prototype/types";
const keys = new Set(["id", "role", "stage", "content", "quote", "action", "issueRank", "level", "suggestionIds", "userId", "afterFollowUp", "replyToMessageId", "demoSentence"]);
/** Preserve legacy key order and absent fields; never forward added metadata. */
export function modelMessages(messages: CoachMessage[]) {
  return messages.map(message => Object.fromEntries(Object.entries(message).filter(([key]) => keys.has(key))));
}
