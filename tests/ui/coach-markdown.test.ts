import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CoachMarkdown } from "../../components/coach/coach-markdown";
import { CoachThread } from "../../components/coach/coach-thread";

const render = (content: string) => renderToStaticMarkup(createElement(CoachMarkdown, { content }));

test("the reported coach reply renders Chinese bold labels and actual lists", () => {
  const html = render(`你好！先看一下你目前的准备情况：

1. **立场（stance） **目前写的是 "this is a test"，**理由和例子**都是占位符。
2. **作文正文还是空的**，所以我们先从想法说清楚这一步入手。

建议你先完成下面这个框架：

- **立场**：完全同意、完全不同意，还是部分同意？
- **理由 1 和理由 2**：各写一句话。
  - 再补一个具体的例子。

**结论：**这意味着你需要先表达自己的想法。`);
  assert.ok(html.includes("<strong>立场（stance）</strong>目前"));
  assert.ok(html.includes("<strong>结论：</strong>这意味着"));
  assert.ok(html.includes("<strong>作文正文还是空的</strong>"));
  assert.ok(html.includes("<ol>"));
  assert.equal((html.match(/<ul>/g) ?? []).length, 2);
  assert.equal(html.includes("**"), false);
  assert.equal(html.includes("<p><ol>"), false);
});

test("preserves code and deliberately escaped Markdown when repairing emphasis", () => {
  const html = render("`**立场（stance） **`\n\n```text\n**结论：**不要渲染代码\n```\n\n\\*\\*这是字面星号\\*\\*");
  assert.ok(html.includes("<code>**立场（stance） **</code>"));
  assert.ok(html.includes("**结论：**不要渲染代码"));
  assert.ok(html.includes("**这是字面星号**"));
  assert.equal(html.includes("<strong>"), false);
});

test("supports headings, quotes, numbered start, tables and GFM text formatting", () => {
  const html = render("### 下一步\r\n\r\n> 一个明确的观点\r\n\r\n3. *保留观点*\r\n4. ~~删除赘词~~\r\n\r\n| 原句 | 修改 |\r\n| --- | --- |\r\n| he go | he goes |");
  assert.ok(html.includes("<h3>下一步</h3>"));
  assert.ok(html.includes("<blockquote>"));
  assert.ok(html.includes('<ol start="3">'));
  assert.ok(html.includes("<em>保留观点</em>"));
  assert.ok(html.includes("<del>删除赘词</del>"));
  assert.ok(html.includes('class="coach-table-scroll"'));
  assert.ok(html.includes("<table>"));
  assert.ok(html.includes("<td>he goes</td>"));
});

test("does not execute model HTML, unsafe URLs, or load remote images", () => {
  const html = render('<script>alert("test")</script>\n\n<img src="https://untrusted.example/pixel" onerror="alert(1)">\n\n[危险](javascript:alert%281%29)\n\n![图片说明](https://untrusted.example/tracker.png)\n\n[参考](https://example.com/guide)');
  assert.equal(/<script|<img|onerror=|href="javascript:|rel="preload"/.test(html), false);
  assert.ok(html.includes("图片说明"));
  assert.ok(html.includes('href="https://example.com/guide" target="_blank" rel="noopener noreferrer"'));
});

test("thread renders stored coach messages as Markdown while user evidence stays literal", () => {
  const html = renderToStaticMarkup(createElement(CoachThread, { messages: [
    { id: "user", role: "user", stage: "writing", content: "**用户原文**", quote: "**引用原文**" },
    { id: "coach", role: "coach", stage: "writing", content: "**教练重点**\n\n- 保留自己的例子。" },
  ] }));
  assert.ok(html.includes("**用户原文**"));
  assert.ok(html.includes("**引用原文**"));
  assert.ok(html.includes("<strong>教练重点</strong>"));
  assert.ok(html.includes("<li>保留自己的例子。</li>"));
});
