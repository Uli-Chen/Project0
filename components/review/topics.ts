import { topicLabels } from "@/lib/question-bank/labels";

/** Topics in question-bank order, for filters and grouping. */
export const TOPIC_ORDER = ["education", "technology", "environment", "society", "work", "health", "culture"].filter((key) => key in topicLabels);
