"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, CornerDownLeft, LoaderCircle, MoreHorizontal, PanelRight } from "lucide-react";
import type { SessionState } from "@/lib/pipeline/types";
import type { CardContent } from "@/lib/quick/schemas";
import type { QuestionRequirements } from "@/lib/question-bank/types";
import { cardSlots } from "@/lib/quick/layouts";
import { acceptQuickSnapshot, createIntentLatch, unchangedDraft, persistedIntentKey } from "@/lib/quick/client-state";
import { CoachEmpty, CoachMark } from "@/components/coach/coach-thread";
import { Composer } from "@/components/coach/composer";
import { Starters } from "@/components/coach/starters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsWide } from "@/hooks/use-wide";
import { cn } from "@/lib/utils";
import { LeaveConfirmation } from "./leave-confirmation";

type QuickData = {
  session: SessionState;
  card: { contentVersion: number; content: CardContent; state: string };
  operations: { id: string; kind: string; status: string }[];
  budget: { remaining: { followups: number; checks: number; retries: number }; nextSupplementalAt: string | null } | null;
  checkResults?: { cardVersion: number; results: { id: string; status: string; note: string | null }[] }[];
  deepSession?: SessionState;
  defaultDeepId?: string | null;
};
const operationLabels: Record<string, string> = { running: "处理中", ok: "已完成", needs_development: "还需展开", invalid_output: "教练返回格式不完整", timeout: "等待超时", quota_exhausted: "本次额度已用完", stale: "检查期间卡片有修改，请检查新版本", indeterminate: "上次操作没有完成" };
const stateLabels: Record<string, string> = { draft: "草稿", passed: "已通过检查", unchecked: "已修改，待复查", needs_development: "还需展开" };
const MAX_CHARS = 600;
const fieldClass = "block w-full resize-y rounded-lg border border-input bg-transparent px-3.5 py-3 text-[16px] leading-relaxed transition-[background-color,border-color,box-shadow] duration-(--dur-standard) outline-none placeholder:text-faint hover:border-foreground/35 focus:border-primary/70 focus:shadow-[0_0_0_3px_var(--coach-soft)] disabled:opacity-70";
/** The server stores trimmed text, so trailing whitespace alone is not an unsaved change. */
const sameText = (draft: string, saved: string) => draft === saved || draft.trim() === saved;
export function QuickScreen({ initial, requirements }: { initial: QuickData; requirements: QuestionRequirements }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [draft, setDraft] = useState<Record<string, string>>(Object.fromEntries(initial.card.content.parts.map(p => [p.key, p.text])));
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [calling, setCalling] = useState<"followup" | "check" | "supplemental" | null>(null);
  const [clock, setClock] = useState<number | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [childGone, setChildGone] = useState(false);
  const [leaveIntent, setLeaveIntent] = useState<{ kind: "link"; href: string } | { kind: "deep"; explicitNew: boolean } | null>(null);
  const [selection, setSelection] = useState<{ messageId: string; start: number; end: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const wide = useIsWide();
  const [panelOpen, setPanelOpen] = useState(true);
  const [sheet, setSheet] = useState(false);
  const mutation = useRef(false);
  const inflight = useRef<Promise<QuickData | null> | null>(null);
  const draftRef = useRef(draft);
  const keepAnswer = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  const edited = useRef(false);
  const editRevision = useRef(0);
  const intentLatch = useRef(createIntentLatch());
  const modelLatch = useRef(createIntentLatch());
  const answerLatch = useRef(createIntentLatch());
  const explicitKey = useRef<string | null>(null);
  const dataRef = useRef(initial);
  const epoch = useRef(0);
  const sequence = useRef(0);
  const appliedSequence = useRef(0);
  const accept = useCallback((incoming: QuickData, ticket: { epoch: number; sequence: number }) => {
    if (!acceptQuickSnapshot(dataRef.current, incoming, ticket, { epoch: epoch.current, sequence: appliedSequence.current })) return false;
    dataRef.current = incoming; appliedSequence.current = ticket.sequence; setData(incoming); return true;
  }, []);
  const slots = cardSlots(requirements);
  const savedText = (from: QuickData, key: string) => from.card.content.parts.find(p => p.key === key)?.text ?? "";
  const dirty = slots.some(s => !sameText(draft[s.key] ?? "", savedText(data, s.key)));
  const overLimit = slots.some(s => [...(draft[s.key] ?? "")].length > MAX_CHARS);
  useEffect(() => { draftRef.current = draft; }, [draft]);
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
    void fetch(`${endpoint}/quick`).then(async r => {
      if (!r.ok) return;
      const current: QuickData = await r.json();
      if (cancelled) return;
      if (!accept(current, ticket)) return;
      if (!edited.current) setDraft(Object.fromEntries(current.card.content.parts.map(p => [p.key, p.text])));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [endpoint, router.bfcacheId, accept]);
  const followup = data.session.messages.filter(m => m.role === "coach" && m.action === "quickFollowup").at(-1);
  const pendingAnswer = followup && !data.session.messages.some(m => m.replyToMessageId === followup.id);
  useEffect(() => {
    if (!dirty && !answer.trim()) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, answer]);
  useEffect(() => {
    if (!running) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try { const ticket = { epoch: epoch.current, sequence: ++sequence.current }; const r = await fetch(`${endpoint}/quick`); const value = r.ok ? await r.json() : null; if (value && !stopped) accept(value, ticket); } catch { /* The explicit action reports transport failures. */ }
    }, 1500);
    return () => { stopped = true; clearInterval(timer); };
  }, [running, endpoint, accept]);
  async function request(body: Record<string, unknown>): Promise<QuickData | null> {
    setError("");
    epoch.current++;
    try {
      const r = await fetch(`${endpoint}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, requestId: crypto.randomUUID() }) });
      const value = await r.json();
      if (!r.ok) { if (value.code === "default_child_gone") setChildGone(true); throw new Error(value.error ?? "操作未完成。"); }
      epoch.current++;
      accept(value, { epoch: epoch.current, sequence: ++sequence.current });
      return value;
    } catch (e) { setError(e instanceof Error ? e.message : "连接中断，已保存的内容仍在。请刷新状态确认结果。"); return null; }
  }
  /** Saves the latest draft. Reads refs, so an autosave already in flight is awaited rather than raced. */
  async function save(): Promise<QuickData | null> {
    while (inflight.current) await inflight.current;
    const current = dataRef.current, text = draftRef.current;
    if (!slots.some(s => !sameText(text[s.key] ?? "", savedText(current, s.key)))) return current;
    mutation.current = true; setSaving(true);
    const run = request({ action: "cardSave", cardVersion: current.card.contentVersion, parts: slots.map(s => ({ key: s.key, text: text[s.key] ?? "" })) });
    inflight.current = run;
    try {
      const result = await run;
      if (result) setNotice("");
      return result;
    } finally { inflight.current = null; mutation.current = false; setSaving(false); }
  }
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; });
  // 停笔一会儿就自动保存；检查进行中先不存，免得这次检查对不上卡片版本
  useEffect(() => {
    if (!dirty || overLimit || !active || transitioning || running) return;
    const timer = setTimeout(() => { void saveRef.current(); }, 1200);
    return () => clearTimeout(timer);
  }, [draft, dirty, overLimit, active, transitioning, running]);
  async function model(action: string, extra: Record<string, unknown> = {}) {
    if (running || intentLatch.current.busy || !modelLatch.current.enter()) return;
    const retryKind = action === "quickRetry" ? data.operations.find(o => o.id === extra.operationId)?.kind : null;
    setCalling(action === "quickSupplemental" ? "supplemental" : action === "quickFollowup" || retryKind === "followup" ? "followup" : "check");
    try { const saved = await save(); if (!saved) return; await request({ action, cardVersion: action === "quickFollowup" || action === "quickCheck" ? saved.card.contentVersion : undefined, ...extra }); }
    finally { modelLatch.current.leave(); setCalling(null); }
  }
  /** Leaving saves the card first; only an unsent answer (or a failed save) needs a decision. */
  function allowNavigation(e: { preventDefault(): void }, href: string) {
    if (intentLatch.current.busy || answerLatch.current.busy) { e.preventDefault(); return; }
    if (answer.trim()) { e.preventDefault(); setLeaveIntent({ kind: "link", href }); return; }
    if (dirty || inflight.current) { e.preventDefault(); void saveThenGo(href); }
  }
  async function saveThenGo(href: string) {
    if (!intentLatch.current.enter()) return;
    setTransitioning(true);
    try { if (await save()) router.push(href); else setLeaveIntent({ kind: "link", href }); }
    finally { intentLatch.current.leave(); setTransitioning(false); }
  }
  function confirmLeave() {
    if (!leaveIntent || intentLatch.current.busy || mutation.current || answerLatch.current.busy) return;
    const intent = leaveIntent; setLeaveIntent(null);
    if (intent.kind === "link") router.push(intent.href);
    else void continueDeep(intent.explicitNew, true);
  }
  async function continueDeep(explicitNew = false, discardAnswer = false) {
    if (answerLatch.current.busy || intentLatch.current.busy) return;
    if (answer.trim() && !discardAnswer) { setLeaveIntent({ kind: "deep", explicitNew }); return; }
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
      const r = await fetch(`${endpoint}/lifecycle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const result = await r.json(); if (!r.ok) throw new Error(result.error);
      epoch.current++;
      accept({ ...dataRef.current, session: result.session }, { epoch: epoch.current, sequence: ++sequence.current });
    } catch (e) { setError(e instanceof Error ? e.message : "操作未完成"); }
    finally { intentLatch.current.leave(); setTransitioning(false); }
  }
  async function excerpt(range: { messageId: string; start: number; end: number }, key: string) {
    if (!intentLatch.current.enter()) return;
    setTransitioning(true);
    const revision = editRevision.current;
    try {
      const saved = await save(); if (!saved || !unchangedDraft(editRevision.current, revision)) return;
      const value = await request({ action: "cardExcerpt", cardVersion: saved.card.contentVersion, key, ...range });
      if (value && unchangedDraft(editRevision.current, revision) && value.card.contentVersion === dataRef.current.card.contentVersion) {
        const text = value.card.content.parts.find(p => p.key === key)?.text ?? "";
        edited.current = true; editRevision.current++;
        setDraft(d => ({ ...d, [key]: text })); setSelection(null); reveal(key);
        setNotice(`已放入「${slots.find(s => s.key === key)?.label ?? "卡片"}」`);
      }
    } finally { intentLatch.current.leave(); setTransitioning(false); }
  }
  async function sendAnswer() {
    if (intentLatch.current.busy || !answer.trim() || !answerLatch.current.enter()) return;
    setAnswering(true); const sent = answer;
    try { if (await request({ action: "quickAnswer", text: sent })) setAnswer(current => current === sent ? "" : current); }
    finally { answerLatch.current.leave(); setAnswering(false); }
  }
  async function refresh() {
    try { const ticket = { epoch: epoch.current, sequence: ++sequence.current }; const r = await fetch(`${endpoint}/quick`); const value = await r.json(); if (!r.ok) throw new Error(value.error); accept(value, ticket); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "读取失败"); }
  }
  const latest = data.checkResults?.filter(r => r.cardVersion === data.card.contentVersion).at(-1);
  const quickMessages = data.session.messages.filter(m => m.stage === "quick");
  const gaps = latest?.results.filter(r => r.status !== "met").length ?? 0;
  const checksLeft = data.budget?.remaining.checks ?? null;
  const followupsLeft = data.budget?.remaining.followups ?? null;
  const failedOps = data.operations.slice(-4).filter(o => !["ok", "needs_development", "running"].includes(o.status));
  const passed = data.card.state === "passed";
  /** After something lands in the card, bring that field into view and light it up briefly. */
  function reveal(key: string) {
    setSheet(false); setFlash(key); window.getSelection()?.removeAllRanges();
    window.setTimeout(() => document.getElementById(key)?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }), wide ? 0 : 320);
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
    if ([...combined].length > MAX_CHARS) { setError(`这一栏最多 ${MAX_CHARS} 字，放不下了。可以只选中回答里的一段再放入。`); return; }
    edited.current = true; editRevision.current++;
    setDraft(d => ({ ...d, [key]: combined })); setSelection(null); setError(""); reveal(key);
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
  const lastMessage = quickMessages.at(-1);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [quickMessages.length, coachBusy, pendingAnswer]);
  const retryable = (status: string) => ["invalid_output", "timeout", "indeterminate"].includes(status);
  const retriesLeft = data.budget?.remaining.retries ?? null;
  const failedChecks = failedOps.filter(o => o.kind === "check"), failedFollowups = failedOps.filter(o => o.kind !== "check");
  const filled = slots.filter(s => (draft[s.key] ?? "").trim()).length;
  const starters = quickMessages.length ? ["再问我一个问题"] : filled === 0 ? ["我没什么思路，帮我分析一下", "这道题该从哪里想起？"] : ["帮我把想法想得更深一点"];
  const deepLabel = data.defaultDeepId ? "打开作文" : "用这张卡写成作文";
  const statusText = coachBusy ? runningLabel : runningKind === "supplemental" ? runningLabel : saving ? "保存中" : overLimit ? `有一栏超过 ${MAX_CHARS} 字` : dirty ? "未保存" : notice || "已保存";
  const settled = !running && !saving && !dirty && !overLimit;
  const failedRow = (o: { id: string; kind: string; status: string }) => (
    <div key={o.id} role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-warn-soft px-3.5 py-2.5 text-sm">
      <p className="min-w-0 flex-1">{o.kind === "check" ? "检查" : "追问"}：{operationLabels[o.status] ?? o.status}{retryable(o.status) && retriesLeft === 0 && (o.kind === "check" ? "。重试次数已用完，改一改卡片再检查。" : "。重试次数已用完。")}</p>
      {retryable(o.status) && retriesLeft !== 0 && <Button variant="outline" size="xs" disabled={!active || transitioning || running} onClick={() => void model("quickRetry", { operationId: o.id })}>重试这次操作</Button>}
    </div>
  );

  const coach = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center border-b px-4"><h2 className="text-sm font-semibold">教练</h2></div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-6">
        {quickMessages.length === 0 && !coachBusy && failedFollowups.length === 0 && (
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
            return (
              <div key={m.id} className="flex flex-col items-end gap-1.5">
                <p data-answer={m.id} className="max-w-[88%] rounded-[14px] rounded-br-[4px] border bg-sunk px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                <DropdownMenu>
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
                </DropdownMenu>
              </div>
            );
          })}
          {coachBusy && (
            <div className="flex flex-col gap-2">
              {lastMessage?.role !== "coach" && <CoachMark />}
              <span className="flex gap-1" role="status" aria-label="教练正在追问">
                {[0, 1, 2].map(d => <span key={d} className="size-1.5 animate-pulse rounded-full bg-coach/60" style={{ animationDelay: `${d * 160}ms` }} />)}
              </span>
            </div>
          )}
          {failedFollowups.map(failedRow)}
        </div>
      </div>
      <div className="shrink-0 border-t bg-sheet px-3.5 pt-3 pb-3.5">
        {pendingAnswer ? (
          <Composer
            draft={answer}
            onDraftChange={text => { if (keepAnswer.current && text === "") { keepAnswer.current = false; return; } setAnswer(text); }}
            placeholder="想到什么写什么，中英文都可以"
            disabled={answering || transitioning || !active}
            onSend={() => { keepAnswer.current = true; void sendAnswer(); }}
          />
        ) : followupsLeft === 0 ? (
          <p className="py-1 text-sm text-muted-foreground">这张卡的追问用完了，可以接着改卡片，或直接检查。</p>
        ) : (
          <>
            <Starters items={starters} disabled={!active || transitioning || running} onPick={() => void model("quickFollowup")} />
            {followupsLeft === 1 && <p className="mt-2.5 text-sm text-muted-foreground">还可以追问 1 次</p>}
          </>
        )}
      </div>
    </div>
  );

  return <div className="desk flex h-dvh flex-col overflow-hidden">
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-sheet px-3">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <Link href="/" onNavigate={e => allowNavigation(e, "/")} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"><ChevronLeft className="size-4" />练习</Link>
        <span className="text-input" aria-hidden>/</span>
        <h1 className="truncate px-2 text-[15px] font-semibold">速刷主题卡片</h1>
        <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">{stateLabels[data.card.state]}</Badge>
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <span aria-live="polite" className={cn("meta mr-2 hidden items-center gap-1 sm:inline-flex", settled && "text-good")}>{settled && <Check className="size-3.5" />}{statusText}</span>
        <Button variant="ghost" size={wide ? "icon-sm" : "sm"} aria-label="教练面板" aria-pressed={wide ? panelOpen : sheet} className={cn(wide && !panelOpen && "text-muted-foreground")} onClick={() => wide ? setPanelOpen(open => !open) : setSheet(open => !open)}>{wide ? <PanelRight /> : "教练"}</Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="更多" />}><MoreHorizontal /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {!passed && <DropdownMenuItem disabled={!active || transitioning} onClick={() => void continueDeep()}>{data.defaultDeepId ? "打开作文" : "不检查，直接写成作文"}</DropdownMenuItem>}
            {childGone && <DropdownMenuItem disabled={transitioning} onClick={() => void continueDeep(true)}>明确另开一次练习</DropdownMenuItem>}
            {active && <DropdownMenuItem disabled={transitioning} onClick={() => void lifecycle("setAside")}>先放一放</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/cards?tab=cards" onNavigate={e => allowNavigation(e, "/cards?tab=cards")} />}>全部卡片</DropdownMenuItem>
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
          {leaveIntent && <LeaveConfirmation answerOnly={leaveIntent.kind === "deep"} disabled={transitioning || saving || answering} onCancel={() => setLeaveIntent(null)} onLeave={confirmLeave} />}
          {error && <p role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-destructive/10 px-4 py-3 text-sm"><span className="min-w-0 flex-1">{error}</span><Button size="xs" variant="outline" onClick={() => void refresh()}>刷新状态</Button></p>}
          {passed ? <div role="status" className="motion-reveal flex flex-wrap items-center justify-between gap-3 rounded-xl bg-good-soft px-5 py-4">
            <p className="flex items-center gap-1.5 font-semibold text-good"><Check className="size-4" />题目问的都答到了</p>
            <Button disabled={!active || transitioning} onClick={() => void continueDeep()}>{deepLabel}</Button>
          </div> : latest && gaps > 0 && requirements.subquestions.length > 1 ? <p role="status" className="motion-reveal rounded-xl bg-warn-soft px-5 py-3.5 text-sm"><b className="font-semibold">还有 {gaps} 项没答完整</b>，已在下面标出。</p> : null}
          {failedChecks.map(failedRow)}
          {data.budget && checksLeft === 0 && !passed && <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-sunk px-5 py-3.5 text-sm shadow-[inset_0_0_0_1px_var(--border)]">
            <p className="min-w-0 flex-1"><b className="font-semibold">这张卡的检查次数已用完。</b>额度用完仍可编辑、保存或写成作文。{data.budget.nextSupplementalAt && <>补充检查最早可申请：{new Date(data.budget.nextSupplementalAt).toLocaleString("zh-CN", { timeZone: "Asia/Taipei" })}</>}</p>
            <Button size="sm" variant="outline" disabled={!active || transitioning || running || supplementalWaiting} onClick={() => void model("quickSupplemental")}>申请补充检查</Button>
          </div>}
          <article className="paper px-6 pt-8 pb-10 sm:px-14 sm:pt-11 sm:pb-12">
            <p className="font-serif text-[21px] leading-[1.45] tracking-[-0.005em] text-pretty sm:text-[26px]">{data.session.question?.text ?? data.session.prompt.text}</p>
            <section aria-label="我的卡片" className="mt-9 space-y-10 border-t pt-8">
              {requirements.subquestions.map((q, index) => {
                const result = latest?.results.find(r => r.id === q.key);
                return <fieldset key={q.key} className="space-y-4">
                  <legend className="text-[17px] leading-relaxed font-semibold text-pretty">{requirements.subquestions.length > 1 && <span className="mr-2 text-coach tabular-nums">{index + 1}</span>}{q.zh}</legend>
                  <p className="font-serif text-[15.5px] leading-relaxed text-muted-foreground italic">{q.en}</p>
                  {result && <p className={cn("flex items-start gap-2 rounded-lg px-3.5 py-2.5 text-sm", result.status === "met" ? "bg-good-soft text-good" : "bg-warn-soft")}>
                    <span className="shrink-0 font-semibold">{result.status === "met" ? "已满足" : "还需展开"}</span>{result.note && <span>{result.note}</span>}
                  </p>}
                  {slots.filter(s => s.requirementKey === q.key).map((s, slotIndex) => {
                    const text = draft[s.key] ?? "", length = [...text].length;
                    return <div key={s.key}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-3">
                        <label htmlFor={s.key} className="text-sm font-medium">{s.label}</label>
                        {length > MAX_CHARS - 100 && <span className={cn("text-sm tabular-nums", length > MAX_CHARS ? "font-medium text-destructive" : "text-muted-foreground")}>{length} / {MAX_CHARS}</span>}
                      </div>
                      <textarea id={s.key} disabled={!active || transitioning} rows={3} value={text}
                        placeholder={index === 0 && slotIndex === 0 ? "用自己的话写，中英文都可以" : undefined}
                        aria-invalid={length > MAX_CHARS || undefined}
                        className={cn(fieldClass, result && result.status !== "met" && !text.trim() && "border-warn", length > MAX_CHARS && "border-destructive", flash === s.key && "border-coach bg-coach-soft shadow-[0_0_0_3px_var(--coach-soft)]")}
                        onChange={e => { edited.current = true; editRevision.current++; setDraft(d => ({ ...d, [s.key]: e.target.value })); }} />
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
