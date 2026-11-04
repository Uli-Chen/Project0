import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { buildCoachMessages } from "../lib/llm/coach-messages";
import { generateJson } from "../lib/llm/client";
import { prompt, promptFingerprint } from "../lib/llm/prompts";

const schema = z.object({ reply: z.string() });

test("coach explanations use an explicit system language, defaulting to English", () => {
  for (const [learner, language] of [[undefined, "en"], [{}, "en"], [{ explainLanguage: null }, "en"], [{ explainLanguage: "en" }, "en"], [{ explainLanguage: "zh" }, "zh"]] as const) {
    const context = { learner, student: "请帮我解释。", conversation: [{ role: "coach", content: "历史回复是中文。" }] };
    const messages = buildCoachMessages("instruction", context, schema);
    const selected = prompt(language === "zh" ? "system/coach-language-zh" : "system/coach-language-en");
    const other = prompt(language === "zh" ? "system/coach-language-en" : "system/coach-language-zh");
    assert.ok(messages[0].content.includes(selected));
    assert.equal(messages[0].content.includes(other), false);
    assert.deepEqual(JSON.parse(messages[1].content), JSON.parse(JSON.stringify(context)));
  }
});

test("student text and invalid preference strings cannot supply system instructions", () => {
  const marker = "UNTRUSTED_LANGUAGE_OVERRIDE_3a91";
  const context = { learner: { explainLanguage: marker }, student: marker, conversation: [{ role: "coach", content: marker }] };
  const messages = buildCoachMessages("instruction", context, schema);
  assert.ok(messages[0].content.includes(prompt("system/coach-language-en")));
  assert.equal(messages[0].content.includes(marker), false);
  assert.ok(messages[1].content.includes(marker));
});

test("coach retry keeps its selected language and fingerprints only the dispatched language file", () => {
  const fingerprints: string[] = [];
  for (const language of ["en", "zh"] as const) {
    const first = buildCoachMessages(prompt("coach-v2/prewrite"), { learner: { explainLanguage: language } }, schema);
    const retry = buildCoachMessages(prompt("coach-v2/prewrite"), { learner: { explainLanguage: language } }, schema, 1);
    assert.equal(retry[0].content, `${first[0].content}\n${prompt("system/retry")}`);
    const fingerprint = promptFingerprint(prompt("coach-v2/prewrite"), true, true, retry[0].content);
    const files = (JSON.parse(fingerprint) as { files: { name: string }[] }).files.map(file => file.name);
    assert.ok(files.includes(`system/coach-language-${language}`));
    assert.equal(files.includes(`system/coach-language-${language === "en" ? "zh" : "en"}`), false);
    assert.ok(files.includes("system/retry"));
    fingerprints.push(fingerprint);
  }
  assert.notEqual(fingerprints[0], fingerprints[1]);
});

test("real v2 dispatch puts the frozen explanation preference in the system message", async t => {
  const key = process.env.LLM_API_KEY;
  process.env.LLM_API_KEY = "offline-test-only";
  try {
    for (const language of ["en", "zh"] as const) {
      t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] };
        assert.equal(body.messages[0].role, "system");
        assert.ok(body.messages[0].content.includes(prompt(language === "en" ? "system/coach-language-en" : "system/coach-language-zh")));
        return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: '{"reply":"ok"}' } }] }));
      });
      assert.deepEqual(await generateJson(prompt("coach-v2/prewrite"), { learner: { explainLanguage: language }, student: "我的观点" }, schema, { purpose: "prewrite_turn", coachV2: true, retries: 0 }), { reply: "ok" });
    }
  } finally {
    if (key === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = key;
  }
});
