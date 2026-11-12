import assert from "node:assert/strict";
import { test } from "node:test";
import { outlineFromCard, outlineHasContent } from "../lib/quick/outline-seed";
import { mergeSessionState } from "../lib/pipeline/client-state";
import { createSession } from "../lib/pipeline/initial";
import { outlineGuide } from "../lib/learning/prewrite-guidance";
import type { QuestionRequirements } from "../lib/question-bank/types";
import type { CardContent } from "../lib/quick/schemas";

const direct = { kind: "direct" as const, userId: "u", editId: "e", editedAt: "2026-11-10T00:00:00Z", contentVersion: 1 };
const part = (key: string, text: string) => ({ key, text, provenance: direct, afterFollowUp: 0 as const });

test("权衡题：卡片的好处、坏处、结论、比较依据各自进入对应的提纲格，不串位", () => {
  const requirements: QuestionRequirements = { id: "q", version: 1, layout: "weigh", requiresOverallJudgement: true, subquestions: [{ key: "weigh", en: "Do the benefits outweigh?", zh: "比较利弊" }] };
  const content: CardContent = { layout: "weigh", parts: [part("weigh.advantages", "更独立"), part("weigh.disadvantages", "花费高"), part("weigh.answer", "好处更大"), part("weigh.why", "坏处是短期的")] };
  const outline = outlineFromCard(requirements, content);
  assert.equal(outline.stance?.text, "好处更大");
  assert.equal(outline.reasons[0].claim?.text, "更独立");
  assert.equal(outline.reasons[1].claim?.text, "花费高");
  assert.equal(outline.counter.view?.text, "坏处是短期的");
  assert.deepEqual(outline.stance?.sources, ["速刷卡片"]);
  const guide = outlineGuide("adv_disadv");
  assert.match(guide["reasons.0.claim"], /好处/); assert.match(guide["reasons.1.claim"], /坏处/); assert.match(guide["counter.view"], /比较依据/);
});

test("双问题与双方观点题按小问顺序带入；空卡片不改动提纲", () => {
  const two: QuestionRequirements = { id: "q", version: 1, layout: "two_questions", requiresOverallJudgement: false, subquestions: [{ key: "cause", en: "Why?", zh: "原因" }, { key: "effect", en: "Effect?", zh: "影响" }] };
  const outline = outlineFromCard(two, { layout: "two_questions", parts: [part("cause.answer", "学科太难"), part("cause.why", "基础差"), part("effect.answer", "缺工程师")] });
  assert.equal(outline.reasons[0].claim?.text, "学科太难"); assert.equal(outline.reasons[0].why?.text, "基础差");
  assert.equal(outline.reasons[1].claim?.text, "缺工程师"); assert.equal(outline.reasons[1].why, null); assert.equal(outline.stance, null);
  const both: QuestionRequirements = { id: "q", version: 1, layout: "both_views_opinion", requiresOverallJudgement: true, subquestions: [{ key: "a", en: "A", zh: "观点一" }, { key: "b", en: "B", zh: "观点二" }, { key: "opinion", en: "Yours", zh: "自己的看法" }] };
  const seeded = outlineFromCard(both, { layout: "both_views_opinion", parts: [part("a.answer", "数学重要"), part("b.answer", "沟通重要"), part("opinion.answer", "两者都要"), part("opinion.why", "工作都用得上")] });
  assert.equal(seeded.stance?.text, "两者都要"); assert.equal(seeded.counter.view?.text, "工作都用得上"); assert.equal(seeded.reasons[1].claim?.text, "沟通重要");
  assert.equal(outlineHasContent(outlineFromCard(two, { layout: "two_questions", parts: [] })), false);
});

test("轮询合并不会抹掉正在发送的消息；请求完成或失败后才移除", () => {
  const local = createSession({ kind: "free", mode: "practice" });
  local.messages.push({ id: "pending-req-1", role: "user", stage: "prewriting", content: "我的想法" });
  const generations = { original: 0, revision: 0, outline: 0, nudgesEnabled: 0 };
  const polled = { ...structuredClone(local), messages: local.messages.filter(m => !m.id.startsWith("pending-")) };
  assert.ok(mergeSessionState(local, polled, generations, 0).messages.some(m => m.id === "pending-req-1"));
  const done = { ...polled, completedRequests: ["req-1"], messages: [...polled.messages, { id: "real", role: "user" as const, stage: "prewriting" as const, content: "我的想法" }] };
  assert.deepEqual(mergeSessionState(local, done, generations, 0).messages.map(m => m.id).filter(id => id.startsWith("pending-")), []);
  const failed = { ...polled, pendingAction: { requestId: "req-1", input: { action: "prewrite" as const, text: "我的想法" }, startedAt: "", error: "中断" } };
  assert.ok(!mergeSessionState(local, failed, generations, 0).messages.some(m => m.id.startsWith("pending-")));
});
