import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { jsx } from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckpointTitle } from "../../components/checkpoints/checkpoint-invitation";

test("独立模考 shows a compact title with its rules on demand, not permanent explanations", () => {
  const html = renderToStaticMarkup(jsx(CheckpointTitle, {}));
  assert.match(html, /独立模考 · 40 分钟/);
  assert.match(html, />规则</);
  assert.doesNotMatch(html, /两次之间|不靠帮助/, "rules stay closed until asked for");
  for (const file of ["../../components/checkpoints/checkpoint-invitation.tsx", "../../app/(main)/progress/page.tsx", "../../app/(main)/topics/[topic]/page.tsx"]) {
    assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), "utf8"), /检查点/, `${file} calls it 独立模考`);
  }
});
