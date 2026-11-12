import { practiceCounts } from "../rules/practice";
import type { CompletionView } from "../rules/recommend";
import type { SessionState } from "@/lib/prototype/session-store";
import type { MemoryItem } from "@/lib/prototype/types";
import type { UserProfile } from "@/lib/auth/types";

export const STAGE_LABEL = { prewriting: "梳理思路", writing: "正在写作", evaluating: "评估中", feedback: "查看反馈", revising: "改写中", re_evaluating: "评估改写", compared: "查看对比", finished: "已完成" };

export type EssayStatus = "drafting" | "evaluating" | "evaluated" | "revising" | "done";
export const ESSAY_STATUS_LABEL: Record<EssayStatus, string> = { drafting: "写作中", evaluating: "评估中", evaluated: "已评估", revising: "改写中", done: "已完成" };

/** 界面上不出现工作流阶段，只出现作文的状态 */
export function essayStatus(session: SessionState): EssayStatus {
  switch (session.stage) {
    case "prewriting": case "writing": return "drafting";
    case "evaluating": case "re_evaluating": return "evaluating";
    case "revising": return "revising";
    case "finished": return "done";
    default: return "evaluated";
  }
}

export function essayKindLabel(session: Pick<SessionState, "kind" | "mode">) {
  return session.kind === "assessment" ? "入门测试" : session.mode === "mock" ? "模考" : "练习";
}

export function sessionDate(session: SessionState) {
  return (session as SessionState & { createdAt?: string }).createdAt ?? session.savedAt ?? "";
}

export function formatDate(value: string) {
  if (!value) return "尚未保存";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("zh-CN", { timeZone: "Asia/Taipei", month: "short", day: "numeric" });
}

export function learningSummary(sessions: SessionState[], profile: UserProfile, completionEvents?: CompletionView[]) {
  const evaluated = sessions.filter((session) => session.evaluation).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const finished = sessions.filter((session) => session.stage === "finished");
  const resume = sessions.find((session) => session.stage !== "finished");
  const latest = evaluated[0];
  const totalMinutes = Math.round(sessions.reduce((sum, session) => sum + session.elapsed.original + session.elapsed.revision, 0) / 60);
  const target = profile.target ? Number(profile.target) : null;
  const weeks = weeksLeft(profile);
  const focus = evaluated.flatMap((session) => session.evaluation?.issues ?? []).find((issue) => !profile.excludedMemoryIds.includes(`issue:${issue.code || issue.title}`));
  const taipeiNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const weekStart = new Date(Date.UTC(taipeiNow.getUTCFullYear(), taipeiNow.getUTCMonth(), taipeiNow.getUTCDate() - (taipeiNow.getUTCDay() + 6) % 7) - 8 * 60 * 60 * 1000);
  const weekCompleted = completionEvents ? practiceCounts(completionEvents, new Date()).weekCompleted : sessions.filter((session) => session.completedAt && new Date(session.completedAt) >= weekStart && new Date(session.completedAt).getTime() < weekStart.getTime() + 7 * 86400000).length;
  const examPassed = Boolean(profile.examDate) && weeks === 0;
  return { evaluated, finished, resume, latest, totalMinutes, target, weeks, focus, weekCompleted, examPassed };
}

const WEEK = 7 * 86400000;
const taipeiDay = (time: number) => new Date(time + 8 * 60 * 60_000).toISOString().slice(0, 10);

/** "N weeks to prepare" is saved as the last day of those weeks (Asia/Taipei, today counts as day
 * one), so it counts down like an exam date and reads N weeks on the day it is set. */
export function examDateFromWeeks(weeks: number | string, now = new Date()) {
  const count = Number(weeks);
  return Number.isInteger(count) && count > 0 ? taipeiDay(now.getTime() + (count * 7 - 1) * 86400000) : "";
}

/** Whole weeks left until the exam date (or the end of the planned weeks), 0 once it has passed.
 * Profiles saved before weeks were converted to a date have only the number; they keep showing it. */
export function weeksLeft(profile: Pick<UserProfile, "timeBy" | "examDate" | "weeks">, now = new Date()) {
  if (profile.examDate) return Math.max(0, Math.ceil((new Date(`${profile.examDate}T23:59:59+08:00`).getTime() - now.getTime()) / WEEK));
  return Number(profile.weeks) || 8;
}

export function buildMemory(sessions: SessionState[], profile: UserProfile): MemoryItem[] {
  const evaluated = sessions.filter((session) => session.evaluation).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const items = new Map<string, MemoryItem>();
  for (const session of evaluated) {
    const seenInSession = new Set<string>();
    for (const issue of session.evaluation!.issues) {
      const id = `issue:${issue.code || issue.title}`;
      if (seenInSession.has(id)) continue;
      seenInSession.add(id);
      const existing = items.get(id);
      if (existing) {
        existing.seen += 1;
        existing.status = "recurring";
      } else {
        items.set(id, {
          id, kind: "thinking", code: issue.code,
          summary: issue.title, status: "observed_once", seen: 1, checked: evaluated.length,
          evidence: { sentence: issue.why, date: formatDate(sessionDate(session)) }, topicTags: session.prompt.topicTags,
        });
      }
    }
  }
  for (const difficulty of profile.difficulties ?? []) {
    const id = `self:${difficulty}`;
    items.set(id, { id, kind: "self_report", code: null, summary: difficulty, status: null, seen: 0, checked: 0, evidence: null, topicTags: [] });
  }
  if (profile.lang) {
    items.set("preference:lang", { id: "preference:lang", kind: "preference", code: null, summary: profile.lang === "zh" ? "习惯先用中文整理思路，再写英文" : "习惯直接用英文构思", status: null, seen: 0, checked: 0, evidence: null, topicTags: [] });
  }
  return [...items.values()].map((item) => ({ ...item, deleted: profile.excludedMemoryIds?.includes(item.id) ?? false }));
}
