import type { CompletionView } from './recommend';
export function practiceCounts(events: CompletionView[], now: Date) {
 const local = new Date(now.getTime() + 8*3600000);
 const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - (local.getUTCDay()+6)%7) - 8*3600000;
 return { weekCompleted: events.filter(e => e.completedAt && Date.parse(e.completedAt) >= start && Date.parse(e.completedAt) < start+7*86400000).length, unknownDate: events.filter(e => !e.completedAt).length, completedFamilies: new Set(events.map(e => e.exposureKey).filter(Boolean)).size };
}
