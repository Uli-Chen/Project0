import assert from "node:assert/strict";
import { test } from "node:test";
import { jsx } from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { CardReadonly } from "../../components/quick/card-readonly";
import { AttemptHistory } from "../../components/topics/attempt-history";
import type { CardContent } from "../../lib/quick/schemas";
import type { QuestionRequirements } from "../../lib/question-bank/types";

test("two-question review preserves separate bilingual prompts, answer/reason groups and user provenance", () => {
  const requirements: QuestionRequirements = { id: "q", version: 1, layout: "two_questions", requiresOverallJudgement: false, subquestions: [{ key: "causes", en: "Why is this happening?", zh: "这一现象有哪些原因？" }, { key: "effects", en: "Is this positive or negative?", zh: "这一趋势是积极还是消极？" }] };
  const content: CardContent = { layout: "two_questions", parts: [
    { key: "causes.answer", text: "因为出行成本降低", afterFollowUp: 0, provenance: { kind: "direct", userId: "u", editId: "e", editedAt: "2026-11-01", contentVersion: 1 } },
    { key: "effects.answer", text: "增加工作机会", afterFollowUp: 1, provenance: { kind: "excerpt", userId: "u", messageId: "m", start: 0, end: 6 } },
  ] };
  const html = renderToStaticMarkup(jsx(CardReadonly, { content, requirements }));
  for (const text of ["Why is this happening?", "这一现象有哪些原因？", "Is this positive or negative?", "这一趋势是积极还是消极？", "你的输入", "摘自你的回答"]) assert.ok(html.includes(text), text);
  assert.equal((html.match(/role="group"/g) ?? []).length, 2);
  assert.ok(html.indexOf("因为出行成本降低") < html.indexOf("Is this positive or negative?"));
  assert.ok(!/<textarea|<button|<input/.test(html));
});

test("same-question attempts are distinguished by Taipei start times and trustworthy completion dates", () => {
  const common = { questionId: "q", exposureKey: "f", activity: "deep", lifecycle: "open", activeRevision: false };
  const html = renderToStaticMarkup(jsx(AttemptHistory, { attempts: [
    { ...common, id: "first", createdAt: "2026-11-01T15:00:01Z", lastStudentActionAt: "2026-11-01T15:30:00Z", completed: true },
    { ...common, id: "second", createdAt: "2026-11-01T16:00:02Z", lastStudentActionAt: "2026-11-01T16:30:00Z", completed: false },
  ], completions: [{ attemptId: "first", exposureKey: "f", primaryTopic: "work", questionType: "two_part", activity: "deep", completedAt: "2026-11-01T16:15:00Z" }] }));
  for (const text of ["台北时间", "23:00:01", "00:00:02", "完成于", "最后编辑", 'dateTime="2026-11-01T16:15:00Z"']) assert.ok(html.includes(text), text);
  assert.ok(html.indexOf('/essays/second') < html.indexOf('/essays/first'));
});

test("Deep snapshot renders the frozen question version's bilingual subquestion context", async () => {
  const { CardSnapshotView } = await import("../../components/quick/card-readonly");
  const html = renderToStaticMarkup(jsx(CardSnapshotView, { snapshot: { cardId: "card", contentVersion: 1, state: "passed", lastCheckedVersion: 1, snapshotAt: "2026-11-01T00:00:00Z", content: { layout: "two_questions", parts: [{ key: "cause.answer", text: "学生原话", afterFollowUp: 0, provenance: { kind: "direct", userId: "u", editId: "edit", editedAt: "2026-11-01", contentVersion: 1 } }] } }, requirements: { id: "q", version: 1, layout: "two_questions", requiresOverallJudgement: false, subquestions: [{ key: "cause", en: "Why do people move?", zh: "人们搬家的原因是什么？" }, { key: "effect", en: "What are the consequences?", zh: "会带来什么影响？" }] } }));
  for (const text of ["开始写作时的卡片", "Why do people move?", "人们搬家的原因是什么？", "What are the consequences?", "会带来什么影响？", "学生原话"]) assert.ok(html.includes(text), text);
  assert.ok(!/<textarea|<button|<input/.test(html));
});
