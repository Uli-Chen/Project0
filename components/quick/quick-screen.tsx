"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, CornerDownLeft, LoaderCircle, MoreHorizontal, PanelRight } from "lucide-react";
import type { SessionState } from "@/lib/pipeline/types";
import type { CardContent } from "@/lib/quick/schemas";
import type { QuestionRequirements } from "@/lib/question-bank/types";
import { cardSlots } from "@/lib/quick/layouts";
import {
  acceptQuickSnapshot, createIntentLatch, unchangedDraft, persistedIntentKey, stableRequestId,
  QUICK_STARTERS, ASK_LIMIT, REQUEST_TIMEOUT_MS, TIMEOUT_MESSAGE, OFFLINE_MESSAGE,
  placeable, validateAsk, echoText, planAsk, settleAsk, reconcileAsk, answerDelivered, coachBottom, mergeSnapshot, unsentCoachText, sameText,
  type PendingAsk, type FieldConflict,
  restoreInto, withoutDelivered,
} from "@/lib/quick/client-state";
import { CoachEmpty, CoachMark } from "@/components/coach/coach-thread";
import { Composer } from "@/components/coach/composer";
import { Starters } from "@/components/coach/starters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsWide } from "@/hooks/use-wide";
import { answerToRestore, decodeAnswer, encodeAnswer, quickDraftKey, readLocalDraft, writeLocalDraft } from "@/lib/drafts/local-draft";
import { cn } from "@/lib/utils";
import { LeaveConfirmation } from "./leave-confirmation";

export { QUICK_STARTERS } from "@/lib/quick/client-state";

type QuickData = {
  session: SessionState;
  card: { contentVersion: number; content: CardContent; state: string };
  operations: { id: string; kind: string; status: string }[];
  budget: { remaining: { followups: number; checks: number; retries: number }; nextSupplementalAt: string | null } | null;
  checkResults?: { cardVersion: number; results: { id: string; status: string; note: string | null }[] }[];
  deepSession?: SessionState;
  defaultDeepId?: string | null;
};
type Reply<T> = { ok: true; value: T } | { ok: false; code: string | null; message: string; uncertain: boolean };
/** Where an error belongs: the coach panel (next to its input, also inside the narrow-screen sheet) or the page. */
type Where = "main" | "coach";
const operationLabels: Record<string, string> = { running: "处理中", ok: "已完成", needs_development: "还需展开", invalid_output: "教练返回格式不完整", timeout: "等待超时", quota_exhausted: "本次额度已用完", stale: "检查期间卡片有修改，请检查新版本", indeterminate: "上次操作没有完成" };
const stateLabels: Record<string, string> = { draft: "草稿", passed: "已通过检查", unchecked: "已修改，待复查", needs_development: "还需展开" };
const MAX_CHARS = 600;
const fieldClass = "block w-full resize-y rounded-lg border border-input bg-transparent px-3.5 py-3 text-[16px] leading-relaxed transition-[background-color,border-color,box-shadow] duration-(--dur-standard) outline-none placeholder:text-faint hover:border-foreground/35 focus:border-primary/70 focus:shadow-[0_0_0_3px_var(--coach-soft)] disabled:opacity-70";
const bubbleClass = "max-w-[88%] rounded-[14px] rounded-br-[4px] border bg-sunk px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap";
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const texts = (from: QuickData) => Object.fromEntries(from.card.content.parts.map(p => [p.key, p.text]));
const quickOf = (from: QuickData) => from.session.messages.filter(m => m.stage === "quick");
const lastQuestion = (from: QuickData) => from.session.messages.filter(m => m.role === "coach" && m.action === "quickFollowup").at(-1);
/** Every read and write gives up after REQUEST_TIMEOUT_MS, so a hung connection never blocks later saves. */
async function fetchJson<T>(url: string, init?: RequestInit): Promise<Reply<T>> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...init, signal: controller.signal });
    const value = await r.json().catch(() => null);
    if (r.ok) return value ? { ok: true, value } : { ok: false, code: null, message: OFFLINE_MESSAGE, uncertain: true };
    return { ok: false, code: value?.code ?? null, message: value?.error ?? "操作未完成。", uncertain: r.status >= 500 };
  } catch {
    return { ok: false, code: null, message: controller.signal.aborted ? TIMEOUT_MESSAGE : OFFLINE_MESSAGE, uncertain: true };
  } finally { clearTimeout(timer); }
}

export function QuickScreen({ initial, requirements }: { initial: QuickData; requirements: QuestionRequirements }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [draft, setDraftState] = useState<Record<string, string>>(() => texts(initial));
  /** Reply to the coach's pending question (quickAnswer). */
  const [answer, setAnswerState] = useState("");
  /** What the student types to the coach when no question is pending (quickFollowup with text). Never sent as an answer. */
  const [askDraft, setAskDraftState] = useState("");
  // Both boxes write through to this tab's storage on every change, including changes made by
  // requests that finish after the page was left (a failed send puts its text back).
  const sessionId = initial.session.id;
  const answerRef = useRef(""), askRef = useRef(""), questionRef = useRef<string | null>(null);
  const setAnswer = useCallback((next: string | ((current: string) => string)) => {
    const value = typeof next === "function" ? next(answerRef.current) : next;
    answerRef.current = value; setAnswerState(value);
    writeLocalDraft(quickDraftKey(sessionId, "answer"), encodeAnswer(value, questionRef.current));
  }, [sessionId]);
  const setAskDraft = useCallback((next: string | ((current: string) => string)) => {
    const value = typeof next === "function" ? next(askRef.current) : next;
    askRef.current = value; setAskDraftState(value);
    writeLocalDraft(quickDraftKey(sessionId, "ask"), value);
  }, [sessionId]);
  const restoredLocal = useRef(false);
  /** Unsent text from an earlier visit in this tab, checked against the freshest server copy. */
  const restoreLocal = useCallback((snapshot: QuickData) => {
    if (restoredLocal.current) return;
    restoredLocal.current = true;
    const ask = readLocalDraft(quickDraftKey(sessionId, "ask"));
    if (ask.trim()) setAskDraft(current => restoreInto(current, ask));
    const answerBack = answerToRestore(decodeAnswer(readLocalDraft(quickDraftKey(sessionId, "answer"))), snapshot.session.messages);
    if (answerBack) setAnswer(current => current || answerBack);
    else writeLocalDraft(quickDraftKey(sessionId, "answer"), encodeAnswer(answerRef.current, questionRef.current));
  }, [sessionId, setAnswer, setAskDraft]);
  /** "放弃并离开" means it: nothing is saved or kept on the way out. */
  const discarding = useRef(false);
  const [error, setError] = useState("");
  const [coachError, setCoachError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [conflicts, setConflictsState] = useState<Record<string, FieldConflict>>({});
  const [calling, setCalling] = useState<"followup" | "check" | "supplemental" | null>(null);
  const [clock, setClock] = useState<number | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [childGone, setChildGone] = useState(false);
  const [leaveIntent, setLeaveIntent] = useState<{ kind: "link"; href: string } | { kind: "deep"; explicitNew: boolean } | null>(null);
  const [selection, setSelection] = useState<{ messageId: string; start: number; end: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  /** The ask request not yet confirmed by the server; replayed unchanged before any new one. */
  const [pendingAsk, setPendingAskState] = useState<PendingAsk | null>(null);
  /** An ask that has left the box but is not a pending request yet (the card is saved first). */
  const [preparingAsk, setPreparingAsk] = useState(false);
  /** Polite announcement of the coach's newest question. */
  const [announcement, setAnnouncement] = useState("");
  /** Moves focus to the answer box when the coach's question arrives after the student's send. */
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const wide = useIsWide();
  const [panelOpen, setPanelOpen] = useState(true);
  const [sheet, setSheet] = useState(false);
  const mutation = useRef(false);
  const inflight = useRef<Promise<unknown> | null>(null);
  const draftRef = useRef(draft);
  const conflictsRef = useRef(conflicts);
  const pendingAskRef = useRef<PendingAsk | null>(null);
  /** A save in flight, or one whose result is unknown: a remote text equal to it is our own write. */
  const sentRef = useRef<Record<string, string> | null>(null);
  const saveKey = useRef<{ key: string; id: string } | null>(null);
  const answerKey = useRef<{ key: string; id: string } | null>(null);
  const sentAnswer = useRef<{ text: string; questionId: string } | null>(null);
  const awaitingCoach = useRef(false);
  const keepAnswer = useRef(false);
  const keepAsk = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const editRevision = useRef(0);
  const intentLatch = useRef(createIntentLatch());
  const modelLatch = useRef(createIntentLatch());
  const answerLatch = useRef(createIntentLatch());
  const explicitKey = useRef<string | null>(null);
  const dataRef = useRef(initial);
  const epoch = useRef(0);
  const sequence = useRef(0);
  const appliedSequence = useRef(0);
  const setDraft = (next: Record<string, string>) => { draftRef.current = next; setDraftState(next); };
  const setConflicts = (next: Record<string, FieldConflict>) => { conflictsRef.current = next; setConflictsState(next); };
  const setPendingAsk = (next: PendingAsk | null) => { pendingAskRef.current = next; setPendingAskState(next); };
  const slots = cardSlots(requirements);
  const keys = slots.map(s => s.key);

  /** Everything a newer snapshot settles: other-tab card edits, lost responses, the coach's new question.
   * `wrote`: card fields the request that returned this snapshot filled itself (cardExcerpt). */
  const onSnapshot = useRef<(current: QuickData, incoming: QuickData, wrote: readonly string[]) => void>(() => {});
  useEffect(() => {
    onSnapshot.current = (current, incoming, wrote) => {
      const merged = mergeSnapshot(keys, { version: current.card.contentVersion, texts: texts(current) }, { version: incoming.card.contentVersion, texts: texts(incoming) }, draftRef.current, { sent: sentRef.current, wrote }, conflictsRef.current);
      if (merged) {
        if (merged.changed) { editRevision.current++; setDraft(merged.draft); }
        setConflicts(merged.conflicts);
        if (merged.fresh) setError("这张卡在另一处也改过，有冲突的栏请选择保留哪一版。");
      }
      const messages = quickOf(incoming);
      const settled = reconcileAsk(pendingAskRef.current, "", messages);
      if (settled.pending !== pendingAskRef.current) {
        const done = pendingAskRef.current!;
        setPendingAsk(settled.pending); setCoachError("");
        setAskDraft(text => withoutDelivered(text, done.text));
      }
      if (sentAnswer.current && answerDelivered(sentAnswer.current, messages)) {
        const done = sentAnswer.current; sentAnswer.current = null; answerKey.current = null;
        setAnswer(text => text.trim() === done.text.trim() ? "" : text); setCoachError("");
      }
      const question = lastQuestion(incoming);
      if (question && question.id !== lastQuestion(current)?.id) {
        setAnnouncement(`教练：${question.content}`);
        if (awaitingCoach.current) { awaitingCoach.current = false; setFocusKey(question.id); }
      }
    };
  });
  const accept = useCallback((incoming: QuickData, ticket: { epoch: number; sequence: number }, wrote: readonly string[] = []) => {
    const current = dataRef.current;
    if (!acceptQuickSnapshot(current, incoming, ticket, { epoch: epoch.current, sequence: appliedSequence.current })) return false;
    dataRef.current = incoming; appliedSequence.current = ticket.sequence; setData(incoming);
    onSnapshot.current(current, incoming, wrote);
    return true;
  }, []);
  const savedText = (from: QuickData, key: string) => from.card.content.parts.find(p => p.key === key)?.text ?? "";
  const dirty = slots.some(s => !sameText(draft[s.key] ?? "", savedText(data, s.key)));
  const overLimit = slots.some(s => [...(draft[s.key] ?? "")].length > MAX_CHARS);
  const conflicted = Object.keys(conflicts).length > 0;
  const runningKind = calling ?? data.operations.find(o => o.status === "running")?.kind;
  const running = Boolean(runningKind);
  const runningLabel = runningKind === "followup" ? "教练追问中" : runningKind === "check" ? "检查处理中" : runningKind === "supplemental" ? "正在申请补充检查" : "处理中";
  const supplementalAt = data.budget?.nextSupplementalAt;
  const supplementalWaiting = !!supplementalAt && (clock === null || clock < Date.parse(supplementalAt));
  useEffect(() => {
    if (!supplementalAt) return;
    // Client clock only avoids premature clicks; server rechecks actual eligibility.
    const tick = () => setClock(Date.now());
    const first = setTimeout(tick, 0), timer = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [supplementalAt]);
  const active = data.session.lifecycle === "open";
  const endpoint = `/api/sessions/${data.session.id}`;
  useEffect(() => {
    let cancelled = false;
    const ticket = { epoch: epoch.current, sequence: ++sequence.current };
    void fetchJson<QuickData>(`${endpoint}/quick`).then(reply => {
      if (cancelled) return;
      if (reply.ok) accept(reply.value, ticket);
      restoreLocal(dataRef.current);
    });
    return () => { cancelled = true; };
  }, [endpoint, router.bfcacheId, accept, restoreLocal]);
  const followup = lastQuestion(data);
  const pendingAnswer = !!followup && !data.session.messages.some(m => m.replyToMessageId === followup.id);
  useEffect(() => { questionRef.current = followup?.id ?? null; }, [followup?.id]);
  /** Until the server confirms it, an ask cannot be abandoned, like an answer in flight. */
  const askInFlight = preparingAsk || pendingAsk?.status === "sending";
  const unsent = unsentCoachText({ answer, askDraft, preparingAsk, pendingAsk });
  // A confirmation opened while an ask was sending goes away once nothing is left to lose.
  if (leaveIntent && !unsent && (leaveIntent.kind === "deep" || (!dirty && !saving))) setLeaveIntent(null);
  useEffect(() => {
    if (!dirty && !unsent) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, unsent]);
  useEffect(() => {
    if (!running) return;
    let stopped = false;
    const timer = setInterval(async () => {
      const ticket = { epoch: epoch.current, sequence: ++sequence.current };
      const reply = await fetchJson<QuickData>(`${endpoint}/quick`);
      // The explicit action reports transport failures.
      if (reply.ok && !stopped) accept(reply.value, ticket);
    }, 1500);
    return () => { stopped = true; clearInterval(timer); };
  }, [running, endpoint, accept]);
  const report = (where: Where, message: string) => where === "coach" ? setCoachError(message) : setError(message);
  /** One POST. Its response may carry another tab's card edit, so it is merged like any snapshot;
   * only the save in flight (`sentRef`) and the fields this request fills (`wrote`) count as ours. */
  async function post(body: Record<string, unknown>, requestId: string = crypto.randomUUID(), wrote: readonly string[] = []): Promise<Reply<QuickData>> {
    epoch.current++;
    const reply = await fetchJson<QuickData>(`${endpoint}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, requestId }) });
    if (reply.ok) { epoch.current++; accept(reply.value, { epoch: epoch.current, sequence: ++sequence.current }, wrote); }
    else if (reply.code === "default_child_gone") setChildGone(true);
    return reply;
  }
  async function request(body: Record<string, unknown>, requestId?: string, where: Where = "main", wrote: readonly string[] = []): Promise<QuickData | null> {
    report(where, "");
    const reply = await post(body, requestId, wrote);
    if (reply.ok) return reply.value;
    report(where, reply.message);
    // The coach thread moved on elsewhere, or the result is unknown: show the real state.
    if (reply.uncertain || reply.code === "followup_pending" || reply.code === "followup_unfinished") void refresh(true);
    return null;
  }
  /** One save attempt. "merged": another tab saved first and its text has been merged into the draft. */
  async function saveOnce(where: Where): Promise<QuickData | null | "merged"> {
    const current = dataRef.current, text = draftRef.current;
    if (!slots.some(s => !sameText(text[s.key] ?? "", savedText(current, s.key)))) return current;
    if (Object.keys(conflictsRef.current).length) { report(where, "有一栏和另一处的修改冲突，先选择保留哪一版。"); return null; }
    const parts = slots.map(s => ({ key: s.key, text: text[s.key] ?? "" })), body = { action: "cardSave", cardVersion: current.card.contentVersion, parts };
    // Same body after an unknown result: same requestId, so the receipt answers if the first one landed.
    saveKey.current = stableRequestId(saveKey.current, JSON.stringify(body), () => crypto.randomUUID());
    sentRef.current = Object.fromEntries(parts.map(p => [p.key, p.text]));
    mutation.current = true; setSaving(true);
    const run = post(body, saveKey.current.id);
    inflight.current = run;
    try {
      const reply = await run;
      if (reply.ok) {
        saveKey.current = null; sentRef.current = null; setSaveFailed(false); setNotice("");
        setError(e => e === TIMEOUT_MESSAGE || e === OFFLINE_MESSAGE ? "" : e);
        return reply.value;
      }
      if (reply.code === "card_conflict") {
        saveKey.current = null; sentRef.current = null;
        if (await refresh(true)) return "merged";
      } else if (!reply.uncertain) { saveKey.current = null; sentRef.current = null; }
      setSaveFailed(true); setError(reply.message);
      if (where === "coach") setCoachError(reply.message);
      return null;
    } finally { inflight.current = null; mutation.current = false; setSaving(false); }
  }
  /** Saves the latest draft. Reads refs, so an autosave already in flight is awaited rather than raced. */
  async function save(where: Where = "main"): Promise<QuickData | null> {
    while (inflight.current) await inflight.current;
    const first = await saveOnce(where);
    if (first !== "merged") return first;
    if (Object.keys(conflictsRef.current).length) { if (where === "coach") setCoachError("这张卡在另一处也改过，先在卡片里选择保留哪一版。"); return null; }
    const second = await saveOnce(where);
    return second === "merged" ? null : second;
  }
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; });
  // Leaving by the back button skips the page's leave checks: save what is typed right away
  // instead of dropping it with the autosave timer. save() itself does nothing when all is saved.
  useEffect(() => () => { if (!discarding.current) void saveRef.current(); }, []);

  // 停笔一会儿就自动保存；检查进行中先不存，免得这次检查对不上卡片版本；有冲突时等学生选择
  useEffect(() => {
    if (!dirty || overLimit || conflicted || !active || transitioning || running) return;
    const timer = setTimeout(() => { void saveRef.current(); }, 1200);
    return () => clearTimeout(timer);
  }, [draft, dirty, overLimit, conflicted, active, transitioning, running, data.card.contentVersion]);
  async function model(action: string, extra: Record<string, unknown> = {}, where: Where = "main"): Promise<QuickData | null> {
    if (running || intentLatch.current.busy || !modelLatch.current.enter()) return null;
    const retryKind = action === "quickRetry" ? data.operations.find(o => o.id === extra.operationId)?.kind : null;
    const coachCall = action === "quickFollowup" || retryKind === "followup";
    setCalling(action === "quickSupplemental" ? "supplemental" : coachCall ? "followup" : "check");
    try {
      const saved = await save(where); if (!saved) return null;
      if (coachCall) awaitingCoach.current = true;
      const result = await request({ action, cardVersion: action === "quickFollowup" || action === "quickCheck" ? saved.card.contentVersion : undefined, ...extra }, undefined, where);
      if (!result) awaitingCoach.current = false;
      return result;
    }
    finally { modelLatch.current.leave(); setCalling(null); }
  }
  const restoreAsk = (text: string) => setAskDraft(current => restoreInto(current, text));
  /** The student speaks first: typed text or a starter, sent as one quickFollowup with text.
   * An unconfirmed earlier ask is replayed unchanged first (same text, cardVersion and requestId). */
  async function ask(raw: string, typed: boolean) {
    const valid = validateAsk(raw);
    // Not sent: the Composer is about to clear itself, so keep the text where it is.
    if (!valid.ok) { if (valid.error) setCoachError(valid.error); if (typed) keepAsk.current = true; return; }
    if (running || intentLatch.current.busy || !modelLatch.current.enter()) { if (typed) keepAsk.current = true; return; }
    const sent = { text: valid.text, typed };
    setCalling("followup"); setCoachError(""); setPreparingAsk(true);
    try {
      const saved = await save("coach");
      if (!saved) { if (typed) restoreAsk(sent.text); return; }
      let { request: attempt } = planAsk(pendingAskRef.current, sent.text, saved.card.contentVersion, quickOf(saved).length, () => crypto.randomUUID());
      for (let round = 0; round < 2; round++) {
        setPendingAsk(attempt); setPreparingAsk(false); awaitingCoach.current = true; nearBottom.current = true;
        const reply = await post({ action: "quickFollowup", cardVersion: attempt.cardVersion, text: attempt.text }, attempt.requestId);
        const outcome = settleAsk(attempt, reply, sent, quickOf(dataRef.current));
        if (outcome.newIntent && round === 0) {
          // card_conflict: the replay never reached the server. Start a new intent on the current card.
          if (dataRef.current.card.contentVersion === attempt.cardVersion) await refresh(true);
          const current = dataRef.current;
          attempt = { text: sent.text, cardVersion: current.card.contentVersion, requestId: crypto.randomUUID(), after: quickOf(current).length, status: "sending" };
          continue;
        }
        setPendingAsk(outcome.pending);
        // Only a delivered ask waits for the coach's question (to announce it and focus the answer box).
        if (outcome.pending || outcome.error || outcome.newIntent) awaitingCoach.current = false;
        if (outcome.newIntent) { if (typed) restoreAsk(sent.text); if (!reply.ok) setCoachError(reply.message); }
        if (outcome.clear) { const done = outcome.clear; setAskDraft(text => withoutDelivered(text, done)); }
        if (outcome.restore) restoreAsk(outcome.restore);
        if (outcome.error) setCoachError(outcome.error);
        if (outcome.refresh) void refresh(true);
        break;
      }
    } finally { modelLatch.current.leave(); setCalling(null); setPreparingAsk(false); }
  }
  /** Leaving saves the card first; only unsent coach text (or a failed save) needs a decision. */
  function allowNavigation(e: { preventDefault(): void }, href: string) {
    if (intentLatch.current.busy || answerLatch.current.busy) { e.preventDefault(); return; }
    if (unsent) { e.preventDefault(); setLeaveIntent({ kind: "link", href }); return; }
    if (dirty || inflight.current) { e.preventDefault(); void saveThenGo(href); }
  }
  async function saveThenGo(href: string) {
    if (!intentLatch.current.enter()) return;
    setTransitioning(true);
    try { if (await save()) router.push(href); else setLeaveIntent({ kind: "link", href }); }
    finally { intentLatch.current.leave(); setTransitioning(false); }
  }
  function confirmLeave() {
    if (!leaveIntent || intentLatch.current.busy || mutation.current || answerLatch.current.busy || askInFlight) return;
    const intent = leaveIntent; setLeaveIntent(null);
    // The button says the unsent text is given up: drop it here and in this tab's storage.
    setAnswer(""); setAskDraft("");
    if (intent.kind === "link") { discarding.current = true; router.push(intent.href); }
    else void continueDeep(intent.explicitNew, true);
  }
  async function continueDeep(explicitNew = false, discardAnswer = false) {
    if (answerLatch.current.busy || intentLatch.current.busy) return;
    if (unsent && !discardAnswer) { setLeaveIntent({ kind: "deep", explicitNew }); return; }
    if (!intentLatch.current.enter()) return;
    setTransitioning(true);
    try {
      const revision = editRevision.current;
      const saved = await save(); if (!saved || !unchangedDraft(editRevision.current, revision)) return;
      // Persist only an opaque intent key, so a lost response followed by refresh
      // cannot create a second explicitly requested child.
      const storageKey = `quick-explicit-new:${data.session.id}`;
      if (explicitNew && !explicitKey.current) {
        let storage: Storage | null = null;
        try { storage = window.sessionStorage; } catch { /* storage can be unavailable */ }
        explicitKey.current = persistedIntentKey(storage, storageKey, () => crypto.randomUUID());
      }
      const result = await request({ action: "continueDeep", explicitNew, idempotencyKey: explicitNew ? explicitKey.current : crypto.randomUUID() });
      if (result?.deepSession && unchangedDraft(editRevision.current, revision)) {
        if (explicitNew) { try { sessionStorage.removeItem(storageKey); } catch { /* no content stored */ } }
        router.push(`/essays/${result.deepSession.id}`);
      }
    } finally { intentLatch.current.leave(); setTransitioning(false); }
  }
  async function lifecycle(action: string) {
    if (answerLatch.current.busy || !intentLatch.current.enter()) return;
    setTransitioning(true);
    try {
      const revision = editRevision.current;
      if (action !== "resume" && (!await save() || !unchangedDraft(editRevision.current, revision))) return;
      epoch.current++;
      const reply = await fetchJson<{ session: SessionState }>(`${endpoint}/lifecycle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      if (!reply.ok) { setError(reply.message); return; }
      epoch.current++;
      accept({ ...dataRef.current, session: reply.value.session }, { epoch: epoch.current, sequence: ++sequence.current });
    } finally { intentLatch.current.leave(); setTransitioning(false); }
  }
  async function excerpt(range: { messageId: string; start: number; end: number }, key: string) {
    if (!intentLatch.current.enter()) return;
    setTransitioning(true);
    const revision = editRevision.current;
    try {
      const saved = await save("coach"); if (!saved || !unchangedDraft(editRevision.current, revision)) return;
      const value = await request({ action: "cardExcerpt", cardVersion: saved.card.contentVersion, key, ...range }, undefined, "coach", [key]);
      // The response merge already put the excerpt into the draft (unless the field was typed in meanwhile).
      if (value && sameText(draftRef.current[key] ?? "", value.card.content.parts.find(p => p.key === key)?.text ?? "")) {
        setSelection(null); reveal(key);
        setNotice(`已放入「${slots.find(s => s.key === key)?.label ?? "卡片"}」`);
      }
    } finally { intentLatch.current.leave(); setTransitioning(false); }
  }
  async function sendAnswer() {
    const sent = answer, question = followup;
    if (intentLatch.current.busy || !sent.trim() || !question || !answerLatch.current.enter()) return;
    // Same answer to the same question after a lost response: same requestId.
    answerKey.current = stableRequestId(answerKey.current, `${question.id}\n${sent.trim()}`, () => crypto.randomUUID());
    sentAnswer.current = { text: sent, questionId: question.id };
    setAnswering(true); setFocusKey(null); nearBottom.current = true;
    try {
      if (await request({ action: "quickAnswer", text: sent }, answerKey.current.id, "coach")) {
        setAnswer(current => current === sent ? "" : current); answerKey.current = null; sentAnswer.current = null;
      }
    } finally { answerLatch.current.leave(); setAnswering(false); }
  }
  /** Reads the server state. A newer card is merged with the draft, never just re-versioned under it. */
  async function refresh(keepError = false) {
    const ticket = { epoch: epoch.current, sequence: ++sequence.current };
    const reply = await fetchJson<QuickData>(`${endpoint}/quick`);
    if (!reply.ok) { setError(reply.message); return false; }
    accept(reply.value, ticket);
    if (!keepError) { setError(""); setCoachError(""); }
    return true;
  }
  function keepMine(key: string) {
    const next = { ...conflictsRef.current }; delete next[key]; setConflicts(next);
    if (!Object.keys(next).length) setError("");
  }
  function takeTheirs(key: string) {
    const theirs = conflictsRef.current[key]?.theirs ?? savedText(dataRef.current, key);
    editRevision.current++; setDraft({ ...draftRef.current, [key]: theirs });
    keepMine(key);
  }
  // Once the draft differs from the checked version, the old verdict is no longer current.
  const verdictStale = dirty || conflicted;
  const latest = verdictStale ? undefined : data.checkResults?.filter(r => r.cardVersion === data.card.contentVersion).at(-1);
  const staleResults = verdictStale ? data.checkResults?.filter(r => r.cardVersion === data.card.contentVersion).at(-1) : undefined;
  const quickMessages = quickOf(data);
  const gaps = latest?.results.filter(r => r.status !== "met").length ?? 0;
  const checksLeft = data.budget?.remaining.checks ?? null;
  const followupsLeft = data.budget?.remaining.followups ?? null;
  const failedOps = data.operations.slice(-4).filter(o => !["ok", "needs_development", "running"].includes(o.status));
  const passed = data.card.state === "passed" && !verdictStale;
  const badge = verdictStale && (data.card.state === "passed" || staleResults) ? "内容已修改，待检查" : stateLabels[data.card.state];
  /** After something lands in the card, bring that field into view and light it up briefly. */
  function reveal(key: string) {
    setSheet(false); setFlash(key); window.getSelection()?.removeAllRanges();
    window.setTimeout(() => document.getElementById(key)?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" }), wide ? 0 : 320);
    window.setTimeout(() => setFlash(current => current === key ? null : current), 1600);
  }
  /** Put an answer (or the selected part of it) into a card field. An empty field keeps the
   * excerpt provenance on the server; a filled one is appended locally as the student's edit. */
  function place(message: { id: string; content: string }, key: string) {
    const picked = selection?.messageId === message.id ? selection : { messageId: message.id, start: 0, end: message.content.length };
    const slice = message.content.slice(picked.start, picked.end), text = slice.trim();
    if (!text) return;
    // The card stores trimmed text, so the excerpt range leaves surrounding whitespace out.
    const start = picked.start + (slice.length - slice.trimStart().length);
    const range = { messageId: message.id, start, end: start + text.length };
    const existing = (draft[key] ?? "").trim();
    if (!existing) { void excerpt(range, key); return; }
    const combined = `${existing}\n${text}`;
    if ([...combined].length > MAX_CHARS) { setCoachError(`这一栏最多 ${MAX_CHARS} 字，放不下了。可以只选中回答里的一段再放入。`); return; }
    editRevision.current++;
    setDraft({ ...draftRef.current, [key]: combined }); setSelection(null); setCoachError(""); reveal(key);
    setNotice(`已追加到「${slots.find(s => s.key === key)?.label ?? "卡片"}」`);
  }
  // 在自己的回答里划选一段，就只放入这一段；点别处取消
  useEffect(() => {
    const onSelection = () => {
      const picked = window.getSelection();
      if (!picked || picked.isCollapsed || !picked.rangeCount) return;
      const range = picked.getRangeAt(0), node = range.commonAncestorContainer;
      const bubble = (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>("[data-answer]");
      if (!bubble?.dataset.answer) return;
      const before = range.cloneRange(); before.selectNodeContents(bubble); before.setEnd(range.startContainer, range.startOffset);
      const start = before.toString().length, end = start + range.toString().length;
      if (end > start) setSelection({ messageId: bubble.dataset.answer, start, end });
    };
    const onPointerDown = (event: PointerEvent) => { if (!(event.target instanceof Element && event.target.closest("[data-keep-selection]"))) setSelection(null); };
    document.addEventListener("selectionchange", onSelection); document.addEventListener("pointerdown", onPointerDown);
    return () => { document.removeEventListener("selectionchange", onSelection); document.removeEventListener("pointerdown", onPointerDown); };
  }, []);
  const coachBusy = running && runningKind === "followup";
  // Once the snapshot carries the sent text, the local bubble would only duplicate it.
  const echo = echoText(pendingAsk, quickMessages);
  const lastMessage = echo ? { role: "user" as const } : quickMessages.at(-1);
  // 只在学生本来就在底部附近（或刚发出一句）时跟随新消息
  useEffect(() => {
    const el = scroller.current;
    if (el && nearBottom.current) el.scrollTo({ top: el.scrollHeight, behavior: reducedMotion() ? "auto" : "smooth" });
  }, [quickMessages.length, coachBusy, pendingAnswer, echo]);
  const retryable = (status: string) => ["invalid_output", "timeout", "indeterminate"].includes(status);
  const retriesLeft = data.budget?.remaining.retries ?? null;
  const failedChecks = failedOps.filter(o => o.kind === "check"), failedFollowups = failedOps.filter(o => o.kind !== "check");
  const filled = slots.filter(s => (draft[s.key] ?? "").trim()).length;
  const starters = quickMessages.length ? [QUICK_STARTERS[3]] : filled === 0 ? [QUICK_STARTERS[0], QUICK_STARTERS[1]] : [QUICK_STARTERS[2]];
  const lastFollowupOp = data.operations.filter(o => o.kind === "followup").at(-1);
  const followupStuck = !!lastFollowupOp && !["ok", "running"].includes(lastFollowupOp.status);
  const bottom = coachBottom({ pendingAnswer, followupStuck, followupsLeft });
  // Text typed while the last ask was in flight must stay visible (to copy or clear) once asking is over.
  // Either box can hold text typed while its last send was in flight; once that box is gone, keep the text visible.
  const leftovers = [
    ...(bottom !== "answer" && answer.trim() ? [{ text: answer, clear: () => setAnswer("") }] : []),
    ...(bottom !== "ask" && askDraft.trim() ? [{ text: askDraft, clear: () => setAskDraft("") }] : []),
  ];
  const leftover = leftovers.length > 0;
  const failedAsk = pendingAsk?.status === "failed" ? pendingAsk : null;
  const deepLabel = data.defaultDeepId ? "打开作文" : "用这张卡写成作文";
  const statusText = coachBusy ? runningLabel : runningKind === "supplemental" ? runningLabel : saving ? "保存中" : saveFailed ? "保存失败" : conflicted ? "有冲突待选择" : overLimit ? `有一栏超过 ${MAX_CHARS} 字` : dirty ? "未保存" : notice || "已保存";
  const settled = !running && !saving && !saveFailed && !dirty && !overLimit;
  const failedRow = (o: { id: string; kind: string; status: string }, where: Where) => (
    <div key={o.id} role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-warn-soft px-3.5 py-2.5 text-sm">
      <p className="min-w-0 flex-1">{o.kind === "check" ? "检查" : "追问"}：{operationLabels[o.status] ?? o.status}{retryable(o.status) && retriesLeft === 0 && (o.kind === "check" ? "。重试次数已用完，改一改卡片再检查。" : "。重试次数已用完。")}</p>
      {retryable(o.status) && retriesLeft !== 0 && <Button variant="outline" size="xs" disabled={!active || transitioning || running} onClick={() => void model("quickRetry", { operationId: o.id }, where)}>重试这次操作</Button>}
    </div>
  );

  /** Composer clears itself on send; the answer stays in `answer` until the server has it. */
  const changeAnswer = (text: string) => { if (keepAnswer.current && text === "") { keepAnswer.current = false; return; } setAnswer(text); };
  /** The ask box empties on send (the bubble shows the text); a refused send keeps it. */
  const changeAsk = (text: string) => { if (keepAsk.current && text === "") { keepAsk.current = false; return; } setAskDraft(text); };
  const coachAlert = (coachError || failedAsk) && (
    <div role="alert" className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1">{coachError || "上一句还没有发出。"}</span>
      {failedAsk && bottom === "ask" && <Button size="xs" variant="outline" disabled={!active || transitioning || running} onClick={() => void ask(failedAsk.text, false)}>重新发送</Button>}
    </div>
  );
  const coach = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center border-b px-4"><h2 className="text-sm font-semibold">教练</h2></div>
      <div ref={scroller} onScroll={event => { const el = event.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }} className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-6">
        {quickMessages.length === 0 && !echo && !coachBusy && failedFollowups.length === 0 && (
          <CoachEmpty />
        )}
        <div className="flex flex-col gap-5">
          {quickMessages.map((m, i) => {
            if (m.role !== "user") return (
              <div key={m.id} className="flex min-w-0 flex-col gap-2 text-sm leading-[1.7] animate-in fade-in-0 duration-300">
                {quickMessages[i - 1]?.role !== "coach" && <CoachMark />}
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            );
            const asked = quickMessages.find(q => q.id === m.replyToMessageId);
            const suggested = asked?.targetKey && slots.some(s => s.key === asked.targetKey) ? asked.targetKey : null;
            const partial = selection?.messageId === m.id;
            const canPlace = placeable(m);
            return (
              <div key={m.id} className="flex flex-col items-end gap-1.5">
                <p data-answer={canPlace ? m.id : undefined} className={bubbleClass}>{m.content}</p>
                {canPlace && <DropdownMenu>
                  <DropdownMenuTrigger data-keep-selection render={<Button size="xs" variant="ghost" className="text-coach hover:text-coach" disabled={!active || transitioning} />}>
                    <CornerDownLeft />{partial ? "放入选中的部分" : "放进卡片"}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent data-keep-selection align="end" className="w-64">
                    {requirements.subquestions.map((q, index) => (
                      <DropdownMenuGroup key={q.key}>
                        {requirements.subquestions.length > 1 && <DropdownMenuLabel className="line-clamp-1">{index + 1}. {q.zh}</DropdownMenuLabel>}
                        {slots.filter(s => s.requirementKey === q.key).map(s => (
                          <DropdownMenuItem key={s.key} onClick={() => place(m, s.key)}>
                            {s.label}{s.key === suggested && <span className="ml-auto text-xs text-coach">教练问的这一栏</span>}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>}
              </div>
            );
          })}
          {echo && <div className="flex flex-col items-end"><p className={bubbleClass}>{echo}</p></div>}
          {coachBusy && (
            <div className="flex flex-col gap-2">
              {lastMessage?.role !== "coach" && <CoachMark />}
              <span className="flex gap-1" role="status" aria-label="教练正在追问">
                {[0, 1, 2].map(d => <span key={d} className="size-1.5 animate-pulse rounded-full bg-coach/60" style={{ animationDelay: `${d * 160}ms` }} />)}
              </span>
            </div>
          )}
          {failedFollowups.map(o => failedRow(o, "coach"))}
        </div>
      </div>
      {(bottom !== "stuck" || coachAlert || leftover) && <div className="shrink-0 border-t bg-sheet px-3.5 pt-3 pb-3.5">
        {coachAlert}
        {bottom === "answer" ? (
          <Composer
            draft={answer}
            onDraftChange={changeAnswer}
            placeholder="想到什么写什么，中英文都可以"
            disabled={answering || transitioning || !active}
            focusKey={focusKey}
            onSend={() => { keepAnswer.current = true; void sendAnswer(); }}
          />
        ) : bottom === "used_up" ? (
          <p className="py-1 text-sm text-muted-foreground">这张卡的追问用完了，可以接着改卡片，或直接检查。</p>
        ) : null}
        {leftovers.map(item => (
          <div key={item.text} className="mt-2.5 flex items-start gap-2 rounded-lg border bg-sunk py-2 pr-2 pl-3 first:mt-0">
            <p className="min-w-0 flex-1 text-sm leading-relaxed whitespace-pre-wrap select-text">{item.text}</p>
            <Button size="xs" variant="ghost" onClick={item.clear}>清除</Button>
          </div>
        ))}
        {bottom === "ask" ? (
          <div className="flex flex-col gap-2.5">
            {!failedAsk && <Starters items={starters} disabled={!active || transitioning || running} onPick={text => void ask(text, false)} />}
            <Composer
              draft={askDraft}
              onDraftChange={changeAsk}
              placeholder="问教练，或者先说说你的想法"
              disabled={transitioning || !active || running}
              maxLength={ASK_LIMIT}
              onSend={text => void ask(text, true)}
            />
            {followupsLeft === 1 && <p className="text-sm text-muted-foreground">还可以追问 1 次</p>}
          </div>
        ) : null}
      </div>}
    </div>
  );

  return <div className="desk flex h-dvh flex-col overflow-hidden">
    <p aria-live="polite" className="sr-only">{announcement}</p>
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-sheet px-3">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <Link href="/" onNavigate={e => allowNavigation(e, "/")} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"><ChevronLeft className="size-4" />练习</Link>
        <span className="text-input" aria-hidden>/</span>
        <h1 className="truncate px-2 text-[15px] font-semibold">速刷主题卡片</h1>
        <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">{badge}</Badge>
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <span aria-live="polite" className={cn("meta mr-1 inline-flex shrink-0 items-center gap-1 sm:mr-2", settled && "text-good", saveFailed && "text-destructive")}>{settled && <Check className="size-3.5" />}<span className={cn(settled && "sr-only sm:not-sr-only")}>{statusText}</span></span>
        <Button variant="ghost" size={wide ? "icon-sm" : "sm"} aria-label="教练面板" aria-pressed={wide ? panelOpen : sheet} className={cn(wide && !panelOpen && "text-muted-foreground")} onClick={() => wide ? setPanelOpen(open => !open) : setSheet(open => !open)}>{wide ? <PanelRight /> : "教练"}</Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="更多" />}><MoreHorizontal /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {!passed && <DropdownMenuItem disabled={!active || transitioning} onClick={() => void continueDeep()}>{data.defaultDeepId ? "打开作文" : "不检查，直接写成作文"}</DropdownMenuItem>}
            {childGone && <DropdownMenuItem disabled={transitioning} onClick={() => void continueDeep(true)}>明确另开一次练习</DropdownMenuItem>}
            {active && <DropdownMenuItem disabled={transitioning} onClick={() => void lifecycle("setAside")}>先放一放</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/cards?tab=cards&drafts=true" onNavigate={e => allowNavigation(e, "/cards?tab=cards&drafts=true")} />}>全部卡片</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" disabled={!active || transitioning || (running && !passed) || (!passed && checksLeft === 0)} onClick={() => passed ? void continueDeep() : void model("quickCheck")}>
          {passed ? deepLabel : runningKind === "check" ? <><LoaderCircle className="animate-spin" />{runningLabel}</> : checksLeft === 1 ? "检查（还可 1 次）" : "检查"}
        </Button>
      </div>
    </header>
    {!active && <div role="status" className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-warn-soft px-4 py-2.5 text-sm">
      <p className="min-w-0 flex-1">这份练习已{data.session.lifecycle === "closed" ? "关闭" : "暂放"}，卡片内容都还在。</p>
      <Button size="sm" variant="outline" disabled={transitioning} onClick={() => void lifecycle("resume")}>恢复练习</Button>
    </div>}
    <div className={cn("flex min-h-0 flex-1", wide && "gap-3 p-3")}>
      <main id="main-content" className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[800px] flex-col gap-3 px-3 py-4 sm:px-6 sm:py-8">
          {leaveIntent && <LeaveConfirmation answerOnly={leaveIntent.kind === "deep"} disabled={transitioning || saving || answering || askInFlight} onCancel={() => setLeaveIntent(null)} onLeave={confirmLeave} />}
          {(error || saveFailed) && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-destructive/10 px-4 py-3 text-sm">
            <span className="min-w-0 flex-1">{error || "还有修改没有保存。"}</span>
            {saveFailed && <Button size="xs" disabled={saving || transitioning || conflicted} onClick={() => void save()}>重试保存</Button>}
            <Button size="xs" variant="outline" onClick={() => void refresh()}>刷新状态</Button>
          </div>}
          {passed ? <div role="status" className="motion-reveal flex flex-wrap items-center justify-between gap-3 rounded-xl bg-good-soft px-5 py-4">
            <p className="flex items-center gap-1.5 font-semibold text-good"><Check className="size-4" />题目问的都答到了</p>
            <Button disabled={!active || transitioning} onClick={() => void continueDeep()}>{deepLabel}</Button>
          </div> : latest && gaps > 0 && requirements.subquestions.length > 1 ? <p role="status" className="motion-reveal rounded-xl bg-warn-soft px-5 py-3.5 text-sm"><b className="font-semibold">还有 {gaps} 项没答完整</b>，已在下面标出。</p> : null}
          {failedChecks.map(o => failedRow(o, "main"))}
          {data.budget && checksLeft === 0 && !passed && <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-sunk px-5 py-3.5 text-sm shadow-[inset_0_0_0_1px_var(--border)]">
            <p className="min-w-0 flex-1"><b className="font-semibold">这张卡的检查次数已用完。</b>额度用完仍可编辑、保存或写成作文。{data.budget.nextSupplementalAt && <>补充检查最早可申请：{new Date(data.budget.nextSupplementalAt).toLocaleString("zh-CN", { timeZone: "Asia/Taipei" })}</>}</p>
            <Button size="sm" variant="outline" disabled={!active || transitioning || running || supplementalWaiting} onClick={() => void model("quickSupplemental")}>申请补充检查</Button>
          </div>}
          <article className="paper px-6 pt-8 pb-10 sm:px-14 sm:pt-11 sm:pb-12">
            <p className="font-serif text-[21px] leading-[1.45] tracking-[-0.005em] text-pretty sm:text-[26px]">{data.session.question?.text ?? data.session.prompt.text}</p>
            <section aria-label="我的卡片" className="mt-9 space-y-10 border-t pt-8">
              {requirements.subquestions.map((q, index) => {
                // While the draft differs from the checked version, only the gaps stay, as hints for the edit.
                const result = latest?.results.find(r => r.id === q.key) ?? staleResults?.results.find(r => r.id === q.key && r.status !== "met");
                return <fieldset key={q.key} className="space-y-4">
                  <legend className="text-[17px] leading-relaxed font-semibold text-pretty">{requirements.subquestions.length > 1 && <span className="mr-2 text-coach tabular-nums">{index + 1}</span>}{q.zh}</legend>
                  <p className="font-serif text-[15.5px] leading-relaxed text-muted-foreground italic">{q.en}</p>
                  {result && <p className={cn("flex items-start gap-2 rounded-lg px-3.5 py-2.5 text-sm", result.status === "met" ? "bg-good-soft text-good" : "bg-warn-soft")}>
                    <span className="shrink-0 font-semibold">{result.status === "met" ? "已满足" : "还需展开"}</span>{result.note && <span>{result.note}</span>}
                  </p>}
                  {slots.filter(s => s.requirementKey === q.key).map((s, slotIndex) => {
                    const text = draft[s.key] ?? "", length = [...text].length, conflict = conflicts[s.key];
                    return <div key={s.key}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-3">
                        <label htmlFor={s.key} className="text-sm font-medium">{s.label}</label>
                        {length > MAX_CHARS - 100 && <span className={cn("text-sm tabular-nums", length > MAX_CHARS ? "font-medium text-destructive" : "text-muted-foreground")}>{length} / {MAX_CHARS}</span>}
                      </div>
                      <textarea id={s.key} disabled={!active || transitioning} rows={3} value={text}
                        placeholder={index === 0 && slotIndex === 0 ? "用自己的话写，中英文都可以" : undefined}
                        aria-invalid={length > MAX_CHARS || undefined}
                        aria-describedby={conflict ? `${s.key}-conflict` : undefined}
                        className={cn(fieldClass, result && result.status !== "met" && !text.trim() && "border-warn", conflict && "border-warn", length > MAX_CHARS && "border-destructive", flash === s.key && "border-coach bg-coach-soft shadow-[0_0_0_3px_var(--coach-soft)]")}
                        onChange={e => { editRevision.current++; setDraft({ ...draftRef.current, [s.key]: e.target.value }); }} />
                      {conflict && <div id={`${s.key}-conflict`} className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                        <span className="line-clamp-2 min-w-0 flex-1">另一处把这一栏改成了：{conflict.theirs.trim() || "（空）"}</span>
                        <Button size="xs" variant="outline" disabled={!active || transitioning} onClick={() => keepMine(s.key)}>用我的</Button>
                        <Button size="xs" variant="outline" disabled={!active || transitioning} onClick={() => takeTheirs(s.key)}>用另一处的</Button>
                      </div>}
                    </div>;
                  })}
                </fieldset>;
              })}
            </section>
          </article>
        </div>
      </main>
      {wide && panelOpen && <aside aria-label="教练" className="surface w-[400px] shrink-0 overflow-hidden">{coach}</aside>}
    </div>
    {!wide && <Sheet open={sheet} onOpenChange={setSheet}>
      <SheetContent side="right" className="p-0 data-[side=right]:w-full data-[side=right]:max-w-[400px] data-[side=right]:sm:max-w-[400px]">
        <SheetHeader className="sr-only"><SheetTitle>教练</SheetTitle><SheetDescription>教练的追问和你的回答</SheetDescription></SheetHeader>
        {coach}
      </SheetContent>
    </Sheet>}
  </div>;
}
