import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession } from "../lib/pipeline/initial";
import { runAction } from "../lib/pipeline/engine";
import type { SessionState } from "../lib/pipeline/types";
import type { Evaluation } from "../lib/prototype/types";

// Deterministic orchestration regression; deliberately not a live-model test.
test("complete practice retains work, checks evidence, compares both drafts and saves feedback", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.LLM_API_KEY;
  process.env.LLM_API_KEY = "local-flow-test-only";
  const outputs: unknown[] = [];
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    assert.ok(outputs.length, "Unexpected model call");
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(outputs.shift()) } }] });
  };
  let state = createSession({ kind: "free", mode: "practice", prompt: "Should cities invest more in public transport?" });
  const checkpoints: SessionState[] = [];
  const persist = (value: SessionState) => checkpoints.push(structuredClone(value));
  const essay = "Public transport can improve the lives of residents because it reduces traffic and makes daily travel cheaper. For example, a reliable bus network allows students to reach their classes without buying a car. Local authorities should therefore invest in frequent services and safe stations. These investments also support shops by making neighbourhoods easier to visit.";
  const review: Evaluation["review"] = { outlineCoverage: [], breakthrough: "The bus example makes the reasoning concrete.", focusResult: null, selfReportContrast: null, aiRatio: 0 };
  const evaluation: Evaluation = { scores: { overall: 9, dims: { TR: 6, CC: 6, LR: 6.5, GRA: 6.5 }, rationale: { TR: "Addresses the task.", CC: "Links reasons.", LR: "Clear vocabulary.", GRA: "Mostly correct sentences." } }, issues: [{ rank: 1, code: "TR-example", title: "Develop the example", why: "Explain the consequence for the student.", sentenceIds: [2, 9999], hintL1: "What does the saved money allow?", recurring: true }], review };
  try {
    outputs.push({ reply: "为什么支持？", updates: [{ path: "stance", text: "支持公共交通", source: "支持公共交通" }] });
    state = await runAction(state, { action: "prewrite", text: "支持公共交通" }, persist);
    assert.equal(state.outline.stance?.text, "支持公共交通");
    state = await runAction(state, { action: "startWriting" }, persist);
    state.drafts.original = essay;
    outputs.push({ reply: "Try a more direct opening.", suggestions: [{ type: "polish", selectionText: "Public transport can improve the lives of residents", suggestedText: "Public transport improves residents' lives", reason: "More direct." }] });
    state = await runAction(state, { action: "polish", selection: "Public transport can improve the lives of residents" }, persist);
    const suggestion = Object.values(state.suggestions)[0];
    assert.ok(suggestion);
    state.drafts.original = essay.replace(suggestion.selectionText, suggestion.suggestedText);
    state = await runAction(state, { action: "suggestion", id: suggestion.id, status: "accepted" }, persist);
    outputs.push(evaluation, review);
    state = await runAction(state, { action: "evaluate", kind: "original" }, persist);
    assert.equal(state.stage, "feedback");
    assert.equal(state.evaluation?.scores.overall, 6.5, "Server recomputes the overall band rather than trusting model's 9");
    assert.deepEqual(state.evaluation?.issues[0].sentenceIds, [2]);
    assert.equal(state.evaluation?.issues[0].recurring, false, "One essay is not evidence of recurrence");
    assert.ok((state.evaluation?.review.aiRatio ?? 0) > 0);
    assert.equal(checkpoints[0].submitted.original, state.drafts.original);
    state = await runAction(state, { action: "startRevision" }, persist);
    assert.equal(state.drafts.revision, state.submitted.original);
    await assert.rejects(runAction(state, { action: "evaluate", kind: "revision" }, persist), /一样/);
    state.drafts.revision += " Students could spend the money saved on textbooks, improving their access to learning materials.";
    outputs.push({ reply: "Explain the link between transport costs and learning.", suggestions: [] });
    state = await runAction(state, { action: "issue", rank: 1, intent: "more" }, persist);
    assert.equal(state.issueLevels[1], 2);
    outputs.push(evaluation, { issues: [{ rank: 1, status: "resolved", reason: "Added a concrete use of saved money.", revisionSentenceIds: [5, 9999] }], idea: { stanceKept: true, keptPoints: ["Support public transport"], deepened: [], changed: [] }, aiRatio: 0 });
    state = await runAction(state, { action: "evaluate", kind: "revision" }, persist);
    assert.equal(state.stage, "compared");
    assert.deepEqual(state.comparison?.issues[0].revisionSentenceIds, [5]);
    assert.equal(state.submitted.original?.includes("Students could spend"), false);
    assert.equal(state.submitted.revision?.includes("Students could spend"), true);
    state = await runAction(state, { action: "rating", useful: 4, mine: "yes", comment: "Clear feedback" }, persist);
    outputs.push({ memoryChanges: [{ kind: "improving", text: "Added a consequence to this example." }] });
    state = await runAction(state, { action: "finish" }, persist);
    assert.equal(state.stage, "finished");
    assert.equal("planChange" in state.finish!, false);
    assert.equal(state.rating?.useful, 4);
    const callsBefore = requests;
    const repeated = await runAction(state, { action: "finish" }, persist);
    assert.deepEqual(repeated.finish, state.finish);
    assert.equal(requests, callsBefore, "Finishing again does not charge another model request");
    assert.equal(outputs.length, 0);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = previousKey;
  }
});
