import assert from "node:assert/strict";
import { test } from "node:test";
import { jsx } from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { DeepLifecycleBar } from "../../components/essay/deep-lifecycle-bar";
import { EssayBody } from "../../components/essay/essay-body";
import { EssayUiProvider } from "../../components/essay/essay-ui";
import { SessionProvider } from "../../lib/prototype/session-store";
import { createSession } from "../../lib/pipeline/initial";
import { coachCapabilities } from "../../lib/learning/essay-view";

test("Deep lifecycle status exposes recovery with honest checkpoint timing and qualification copy", () => {
  const render = (lifecycle: "open" | "set_aside" | "closed", checkpoint = false, busy = false) => renderToStaticMarkup(jsx(DeepLifecycleBar, { lifecycle, checkpoint, busy, onResume: () => {} }));
  assert.equal(render("open"), "");
  assert.match(render("set_aside"), /已暂放/); assert.match(render("set_aside"), /恢复练习/);
  assert.match(render("closed"), /已关闭/); assert.match(render("closed"), /已保存的内容仍可查看/);
  assert.match(render("open", true), /暂放或离开页面不会暂停/);
  assert.match(render("set_aside", true), /暂放不会延长截止时间/);
  assert.match(render("closed", true), /恢复不会重置检查点时间或资格/);
  assert.match(render("closed", true, true), /disabled=""/);
});

test("set-aside and closed Deep drafts render read-only with retained text and disable coach capabilities", () => {
  for (const lifecycle of ["set_aside", "closed"] as const) {
    const s = createSession({ kind: "free", mode: "practice", prompt: "Synthetic prompt" });
    s.stage = "writing"; s.lifecycle = lifecycle; s.drafts.original = "This is my saved draft.";
    const html = renderToStaticMarkup(jsx(SessionProvider, { initialState: s, children: jsx(EssayUiProvider, { children: jsx(EssayBody, {}) }) }));
    assert.match(html, /This is my saved draft\./); assert.equal(html.includes("textarea"), false);
    for (const stage of ["prewriting", "writing", "revising", "feedback"] as const) {
      s.stage = stage; assert.deepEqual(coachCapabilities(s), { prewrite: false, chat: false, issue: false });
    }
    s.lifecycle = "open"; s.stage = "writing"; assert.equal(coachCapabilities(s).chat, true);
  }
});

test("Deep leave confirmation never promises to save unsent coach text and preserves cancel choice", async () => {
  const { DeepLeaveNotice } = await import("../../components/essay/deep-leave-guard");
  for (const draftDirty of [false, true]) {
    const html = renderToStaticMarkup(jsx(DeepLeaveNotice, { saving: false, draftDirty, onCancel: () => {}, onLeave: () => {} }));
    assert.match(html, /不会随作文草稿保存/); assert.match(html, /留在这里/);
    assert.match(html, draftDirty ? /保存作文并离开，不发送聊天/ : /离开，舍弃未发送文字/);
  }
  const busy = renderToStaticMarkup(jsx(DeepLeaveNotice, { saving: true, draftDirty: true, onCancel: () => {}, onLeave: () => {} }));
  const buttons = busy.match(/<button\b[^>]*>/g) ?? [];
  assert.equal(buttons.length, 2);
  assert.ok(buttons.every(tag => /\sdisabled(?:=|\s|>)/.test(tag)));
});
