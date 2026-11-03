import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { buildMessages } from "../lib/llm/messages";
import { promptConfigVersion } from "../lib/llm/budget";
import { prompt, promptNames, promptsDigest, renderPrompt } from "../lib/llm/prompts";

test("提示词文件：全部可读、非空；只有固定开头含 {{schema}} 占位符", () => {
  for (const name of promptNames) {
    const text = prompt(name);
    assert.ok(text.trim().length > 0, name);
    assert.equal(/\{\{/.test(text), name === "system/preamble", name);
  }
  assert.equal(prompt("system/preamble").match(/\{\{schema\}\}/g)?.length, 1);
});

test("提示词版本：改了 prompts/ 下的文件就要升级 promptConfigVersion，并更新这里的摘要", () => {
  assert.deepEqual({ promptConfigVersion, digest: promptsDigest() }, {
    promptConfigVersion: "coach-json-v4-quick-guidance",
    digest: "a67c74a8907ac07f3c658a489a6bfebd79fa8dad0bd0ed68bae97dd7ab3c2dd9",
  });
});

test("拼装：固定开头 + Schema + 换行 + 任务指令，重试时追加重试提示", () => {
  const schema = z.object({ reply: z.string() });
  const head = prompt("system/preamble").replace("{{schema}}", JSON.stringify(z.toJSONSchema(schema)));
  assert.equal(buildMessages(prompt("coach/chat"), {}, schema)[0].content, `${head}\n${prompt("coach/chat")}`);
  assert.equal(buildMessages(prompt("coach/chat"), {}, schema, 1)[0].content, `${head}\n${prompt("coach/chat")}\n${prompt("system/retry")}`);
});

test("渲染：缺少或多余的变量都报错", () => {
  assert.throws(() => renderPrompt("system/preamble", {}), /missing/);
  assert.throws(() => renderPrompt("system/preamble", { schema: "{}", extra: "x" }), /unused/);
  assert.throws(() => renderPrompt("coach/chat", { schema: "{}" }), /unused/);
});
