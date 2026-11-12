import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement, type ReactNode } from "react";
import { jsx } from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { CheckpointClock } from "../../components/checkpoints/clock";
import { CoachThread, replyAnnouncement } from "../../components/coach/coach-thread";
import { EssayEditor } from "../../components/essay/essay-editor";
import { EssayReader, issueMarkStyle } from "../../components/essay/essay-reader";
import { SessionView } from "../../components/essay/session-view";
import { IssueBadge, IssueList } from "../../components/feedback/issue-list";
import { slotCancelRestore } from "../../components/outline/outline-board";
import { createSession } from "../../lib/pipeline/initial";
import { getSlot } from "../../lib/pipeline/outline";
import { draftSchema } from "../../lib/pipeline/schemas";
import type { SessionState } from "../../lib/pipeline/types";
import { DRAFT_MAX_CHARS, applyOutlineEdit, draftBackupText, failedSendState, pendingWriteAfterFailure, serverHasRequest } from "../../lib/prototype/session-store";
import type { CoachMessage, Issue } from "../../lib/prototype/types";

const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch: async () => {} };
const renderScreen = (session: SessionState, banner?: ReactNode) => renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, SessionView({ session, banner })));
const practice = () => createSession({ kind: "free", mode: "practice", prompt: "Some people think technology makes learning easier. Discuss." });
const issue: Issue = { rank: 2, code: "TR", title: "例子不够具体", why: "理由停在断言。", sentenceIds: [1], hintL1: "补一个具体场景。", recurring: false };

test("definite save rejections drop the rejected snapshot; only unknown outcomes resend it", () => {
  for (const status of [400, 413, 422]) assert.equal(pendingWriteAfterFailure(status, false), "drop", String(status));
  for (const status of [0, 500, 502, 503]) assert.equal(pendingWriteAfterFailure(status, false), "keep", String(status));
  assert.equal(pendingWriteAfterFailure(409, true), "conflict");
  assert.equal(pendingWriteAfterFailure(409, false), "drop");
  // The editor limit is the server's draft limit.
  assert.equal(draftSchema.safeParse({ version: 0, drafts: { original: "a".repeat(DRAFT_MAX_CHARS), revision: "" } }).success, true);
  assert.equal(draftSchema.safeParse({ version: 0, drafts: { original: "a".repeat(DRAFT_MAX_CHARS + 1), revision: "" } }).success, false);
});

test("the essay editor enforces and shows the save limit only near it", () => {
  const short = renderToStaticMarkup(jsx(EssayEditor, { value: "A short essay.", onChange: () => {} }));
  assert.match(short, new RegExp(`maxLength="${DRAFT_MAX_CHARS}"`));
  assert.doesNotMatch(short, /字符/);
  const near = renderToStaticMarkup(jsx(EssayEditor, { value: "a".repeat(DRAFT_MAX_CHARS - 100), onChange: () => {} }));
  assert.match(near, /role="status"/); assert.ok(near.includes(`/ ${DRAFT_MAX_CHARS.toLocaleString()} 字符`));
  const over = renderToStaticMarkup(jsx(EssayEditor, { value: "a".repeat(DRAFT_MAX_CHARS + 5), onChange: () => {} }));
  assert.match(over, /超出部分无法保存/);
});

test("outline typing goes straight into the shared draft and Escape restores the pre-edit value", () => {
  const s = practice();
  const typed = applyOutlineEdit(s, "stance", "I partly agree ");
  assert.equal(getSlot(typed.outline, "stance")?.text, "I partly agree");
  assert.equal(typed.outline.userEdited, true);
  assert.equal(getSlot(s.outline, "stance"), null, "the previous state is not mutated");
  // Escape on a slot that was empty before editing clears what was typed.
  const restore = slotCancelRestore(null, "I partly agree");
  assert.equal(restore, "");
  assert.equal(getSlot(applyOutlineEdit(typed, "stance", restore!).outline, "stance"), null);
  assert.equal(slotCancelRestore("Old claim", "New claim"), "Old claim");
  assert.equal(slotCancelRestore("Old claim", "Old claim"), null);
  assert.equal(slotCancelRestore(null, null), null);
});

test("a coach message the server never received goes back to the composer; an unknown one stays recoverable", () => {
  const base = { acknowledged: false, sent: false, knownAbsent: true, status: 0, answeredWithSession: false };
  assert.equal(failedSendState(base), "absent", "pre-send save failed");
  assert.equal(failedSendState({ ...base, knownAbsent: false }), "unknown", "could not check a retried request");
  assert.equal(failedSendState({ ...base, sent: true }), "unknown", "connection dropped after sending");
  assert.equal(failedSendState({ ...base, sent: true, status: 502 }), "unknown");
  assert.equal(failedSendState({ ...base, sent: true, status: 400 }), "absent");
  assert.equal(failedSendState({ ...base, sent: true, status: 500, answeredWithSession: true }), "absent");
  assert.equal(failedSendState({ ...base, sent: true, acknowledged: true }), "server");
  const s = practice();
  assert.equal(serverHasRequest(s, "r1"), false);
  assert.equal(serverHasRequest({ ...s, pendingAction: { requestId: "r1", input: { action: "chat", text: "hi" }, startedAt: "2026-11-13" } }, "r1"), true);
  assert.equal(serverHasRequest({ ...s, completedRequests: ["r1"] }, "r1"), true);
  assert.equal(serverHasRequest(null, "r1"), false);
});

test("the conflict backup carries the outline, both drafts and unsent coach text", () => {
  let s = practice();
  s = applyOutlineEdit(s, "stance", "I agree");
  s = applyOutlineEdit(s, "reasons.0.claim", "Online courses are flexible");
  s.drafts = { original: "My original essay.", revision: "My revised essay." };
  const text = draftBackupText(s, { composer: "还没发出去的问题", failed: "发送失败的那句" });
  for (const part of [s.prompt.text, "提纲", "立场：I agree", "理由一 · 要点：Online courses are flexible", "原稿\nMy original essay.", "改写稿\nMy revised essay.", "未发送给教练的文字", "还没发出去的问题", "发送失败的那句"]) assert.ok(text.includes(part), part);
  assert.equal(draftBackupText(s, { composer: "同一句", failed: "同一句" }).split("同一句").length - 1, 1);
  const empty = draftBackupText(practice());
  assert.match(empty, /提纲\n（空）/); assert.doesNotMatch(empty, /未发送给教练/);
});

test("the independent-mock clock sits inside the one-viewport workspace column", () => {
  const s = createSession({ kind: "free", mode: "mock", prompt: "Some people think technology makes learning easier. Discuss." });
  s.stage = "writing";
  const html = renderScreen(s, jsx(CheckpointClock, { deadlineAt: "2026-11-01T00:40:00Z", serverNow: "2026-11-01T00:20:00Z" }));
  const column = html.indexOf("h-dvh");
  assert.ok(column >= 0 && html.indexOf('role="timer"') > column);
});

test("narrow screens keep the version toggle and the writing status in a compact row", () => {
  const writing = practice(); writing.stage = "writing"; writing.drafts.original = "One two three.";
  const html = renderScreen(writing);
  const row = html.slice(html.indexOf("</header>"));
  assert.match(row, /sm:hidden/); assert.match(row, /3 \/ 250 词/); assert.match(row, /已保存/);
  const revising = practice(); revising.stage = "revising"; revising.submitted.original = "One two three."; revising.drafts.revision = "One two three four.";
  const both = renderScreen(revising);
  const after = both.slice(both.indexOf("</header>"));
  assert.match(after, /md:hidden/); assert.match(after, /aria-label="版本"/); assert.match(after, /改写稿/);
});

test("essay panel content lives in a TabsContent tabpanel", () => {
  // Base UI links aria-labelledby / aria-controls once tabs register on the client; SSR shows the panel structure.
  const s = practice(); s.stage = "writing";
  const html = renderScreen(s);
  assert.match(html, /role="tab"/);
  const panels = html.match(/<div[^>]*role="tabpanel"[^>]*>/g) ?? [];
  assert.equal(panels.length, 1, "only the active panel is mounted");
  assert.match(panels[0], /data-slot="tabs-content"/);
  const panelBody = html.slice(html.indexOf(panels[0]));
  assert.match(panelBody, /aria-label="问教练"/, "the coach composer sits inside the tabpanel");
});

test("issues use one coach-blue system told apart by number and selection depth", () => {
  for (const rank of [1, 2, 3, 4]) {
    const html = renderToStaticMarkup(jsx(IssueBadge, { rank }));
    assert.match(html, /bg-coach-soft/); assert.doesNotMatch(html, /style=/);
  }
  assert.match(renderToStaticMarkup(jsx(IssueBadge, { rank: 1, active: true })), /bg-coach /);
  for (const active of [false, true]) {
    const style = issueMarkStyle(active);
    assert.match(String(style.backgroundImage), /var\(--hl-3\)/);
    assert.match(String(style.backgroundImage), active ? /var\(--hl-2\)/ : /var\(--hl-1\)/);
  }
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  const themes = [...css.matchAll(/--hl-1: rgb\((\d+ \d+ \d+)[^;]*;\s*--hl-2: rgb\((\d+ \d+ \d+)[^;]*;\s*--hl-3: rgb\((\d+ \d+ \d+)/g)];
  assert.equal(themes.length, 2, "light and dark tokens");
  for (const [, a, b, c] of themes) assert.ok(a === b && b === c, "one hue per theme");
});

test("selecting one issue dims only the other marks' wash; text and 14px numbers stay solid", () => {
  const html = renderToStaticMarkup(jsx(EssayReader, { text: "He go to school. The rent is expensive. It rains.", marks: [{ sentenceId: 1, rank: 1 }, { sentenceId: 2, rank: 2 }], activeRank: 1 }));
  assert.doesNotMatch(html, /opacity-/, "no opacity on marked sentences or their numbers");
  assert.equal((html.match(/<sup[^>]*text-\[14px\]/g) ?? []).length, 2);
  const dim = issueMarkStyle(false, true);
  assert.match(String(dim.backgroundImage), /transparent/);
  assert.doesNotMatch(String(dim.backgroundImage), /var\(--hl-3\)/);
  assert.match(renderToStaticMarkup(jsx(IssueBadge, { rank: 3 })), /text-\[14px\]/);
});

test("the issue list is hairline rows with a coach-blue 改写方向 rule, not nested boxes", () => {
  const html = renderToStaticMarkup(jsx(IssueList, { issues: [issue], activeRank: 2, onSelect: () => {}, onHover: () => {}, onJump: () => {} }));
  assert.match(html, /divide-y/); assert.match(html, /border-l-2 border-coach-line/); assert.match(html, /改写方向/);
  assert.doesNotMatch(html, /rounded-\[10px\]|rounded-lg bg-coach-soft|shadow-\[var\(--shadow-float\)\]/);
  assert.match(html, /aria-pressed="true"/);
});

test("the coach live region announces only replies that arrive after mount", () => {
  const history: CoachMessage[] = [{ id: "u1", role: "user", stage: "writing", content: "怎么开头？" }, { id: "c1", role: "coach", stage: "writing", content: "先想想你的**立场**。" }];
  assert.equal(replyAnnouncement(history, "c1"), "");
  const next = [...history, { id: "c2", role: "coach" as const, stage: "writing" as const, content: `**例子**要具体。 ${"很长".repeat(120)}` }];
  const spoken = replyAnnouncement(next, "c1");
  assert.match(spoken, /^教练已回复：例子要具体。/); assert.ok(spoken.length <= 6 + 161); assert.doesNotMatch(spoken, /\*/);
  const html = renderToStaticMarkup(jsx(CoachThread, { messages: history }));
  assert.match(html, /<p class="sr-only" role="status" aria-live="polite" aria-atomic="true"><\/p>/);
});

test("learner-facing essay copy calls it 独立模考 and keeps secondary text at 14px or more", () => {
  const topbar = readFileSync(new URL("../../components/essay/essay-topbar.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(topbar, /检查点|基线|占位|资格/); assert.match(topbar, /独立模考/);
  assert.match(readFileSync(new URL("../../components/essay/essay-screen.tsx", import.meta.url), "utf8"), />备份当前内容</);
  const compare = readFileSync(new URL("../../components/essay/compare-tab.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(compare, /text-xs|text-\[1[0-3](\.\d+)?px\]/);
});
