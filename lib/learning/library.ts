import type { SessionState } from '../pipeline/types';
import { essayStatus, ESSAY_STATUS_LABEL } from './summary';

/** Completion credit and optional revision progress are independent facts. */
export function libraryEntryState(session: SessionState, completed: boolean) {
  const stageStatus = essayStatus(session);
  const status = completed && !['revising', 're_evaluating'].includes(session.stage) ? 'done' as const : stageStatus;
  const progress = completed && ['revising', 're_evaluating'].includes(session.stage) ? `已完成 · ${ESSAY_STATUS_LABEL[stageStatus]}` : ESSAY_STATUS_LABEL[status];
  const statusLabel = `${progress}${session.lifecycle === 'set_aside' ? ' · 已暂放' : session.lifecycle === 'closed' ? ' · 已关闭' : ''}`;
  return { status, statusLabel, completed, lifecycle: session.lifecycle };
}
export function matchesEssayFilter(row: { completed: boolean; lifecycle: string }, filter: string) {
  return filter === 'all' || (filter === 'done' ? row.completed : !row.completed && row.lifecycle === 'open');
}
