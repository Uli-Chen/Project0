// 原型阶段前端使用的类型；字段名与 原型/90_共享规范.md 第 4 节保持一致，便于之后换成真实接口。

export type Stage =
  | "quick"
  | "prewriting"
  | "writing"
  | "evaluating"
  | "feedback"
  | "revising"
  | "re_evaluating"
  | "compared"
  | "finished";

export type Mode = "practice" | "mock";
export type SessionKind = "assessment" | "task" | "free";
export type EssayKind = "original" | "revision";

export type Prompt = {
  id: string;
  text: string;
  topicTags: string[];
  questionType: "agree_disagree" | "discuss_both" | "adv_disadv" | "problem_solution" | "two_part";
};

export type Focus = { code: string; name: string; instruction: string; reason: string };

export type Slot = { text: string; sources: string[] } | null;
export type Outline = {
  stance: Slot;
  reasons: Array<{ claim: Slot; why: Slot; example: Slot }>;
  counter: { view: Slot; response: Slot };
  userEdited: boolean;
};
export type SlotPath =
  | "stance"
  | `reasons.${number}.claim`
  | `reasons.${number}.why`
  | `reasons.${number}.example`
  | "counter.view"
  | "counter.response";

export type Suggestion = {
  id: string;
  type: "polish" | "express" | "check";
  selectionText: string;
  suggestedText: string;
  reason: string;
  status: "pending" | "accepted" | "dismissed";
};

export type CoachMessage = {
  id: string;
  role: "user" | "coach";
  /** 对话发生在哪个阶段；改写阶段问题对话带 issueRank */
  stage: "prewriting" | "writing" | "issue" | "revision";
  action?: "opening" | "clarify" | "polish" | "check" | "express" | "chat" | "hint" | "attempt" | "ask";
  content: string;
  quote?: string;
  suggestionIds?: string[];
  issueRank?: number;
  level?: 1 | 2 | 3;
  demoSentence?: string;
};

export type Nudge = { paragraphIndex: number; code: string; message: string; dismissed: boolean };

export type Dim = "TR" | "CC" | "LR" | "GRA";
export type Scores = { overall: number; dims: Record<Dim, number>; rationale: Record<Dim, string> };

export type Issue = {
  rank: number;
  code: string;
  title: string;
  why: string;
  sentenceIds: number[];
  hintL1: string;
  recurring: boolean;
};

export type Review = {
  outlineCoverage: Array<{ slot: SlotPath; status: "written" | "partly" | "missing" }>;
  breakthrough: string | null;
  focusResult: { achieved: "yes" | "partial" | "no"; note: string } | null;
  selfReportContrast: string | null;
  aiRatio: number;
};

export type Evaluation = { scores: Scores; issues: Issue[]; review: Review };

export type Comparison = {
  issues: Array<{ rank: number; status: "resolved" | "partly" | "unresolved" | "removed"; reason: string; revisionSentenceIds: number[] }>;
  idea: {
    stanceKept: boolean;
    keptPoints: string[];
    deepened: Array<{ what: string; originalIds: number[]; revisionIds: number[] }>;
    changed: string[];
  };
  aiRatio: number;
};

export type MemoryChange = { kind: "new" | "recurring" | "improving" | "resolved" | "idea"; text: string };

export type MemoryItem = {
  id: string;
  kind: "thinking" | "language" | "behavior" | "idea" | "preference" | "self_report";
  code: string | null;
  summary: string;
  status: "observed_once" | "recurring" | "improving" | "resolved" | null;
  seen: number;
  checked: number;
  evidence: { sentence: string; date: string } | null;
  topicTags: string[];
  deleted?: boolean;
};

export type PlanTask = {
  id: string;
  week: number;
  seq: number;
  type: "focus_practice" | "mock_checkpoint" | "rewrite";
  focus: Focus | null;
  promptTopic: string;
  promptText: string;
  status: "todo" | "in_progress" | "done" | "skipped";
  result?: string;
};

export type User = { id: string; name: string };
