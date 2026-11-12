"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionState } from "@/lib/pipeline/types";
import type { CardContent } from "@/lib/quick/schemas";
import type { QuestionRequirements } from "@/lib/question-bank/types";
import { cardSlots } from "@/lib/quick/layouts";
import { acceptQuickSnapshot, createIntentLatch, unchangedDraft, persistedIntentKey } from "@/lib/quick/client-state";
import { LeaveConfirmation } from "./leave-confirmation";
import { Check, ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
const fieldClass = "w-full rounded-lg border border-input bg-sunk p-3 text-sm leading-relaxed transition-colors focus:bg-sheet focus-visible:outline-primary";
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
  const target = cardSlots(requirements)[0]?.key ?? "";
  const [placeTargets, setPlaceTargets] = useState<Record<string, string>>({});
  const mutation = useRef(false);
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
  const dirty = slots.some(s => (draft[s.key] ?? "") !== (data.card.content.parts.find(p => p.key === s.key)?.text ?? ""));
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
  async function save() {
    if (!dirty) return data;
    if (mutation.current) return null;
    mutation.current = true; setSaving(true);
    try {
      const result = await request({ action: "cardSave", cardVersion: data.card.contentVersion, parts: slots.map(s => ({ key: s.key, text: draft[s.key] ?? "" })) });
      if (result) setNotice("卡片已保存");
      return result;
    } finally { mutation.current = false; setSaving(false); }
  }
  async function model(action: string, extra: Record<string, unknown> = {}) {
    if (running || intentLatch.current.busy || !modelLatch.current.enter()) return;
    const retryKind = action === "quickRetry" ? data.operations.find(o => o.id === extra.operationId)?.kind : null;
    setCalling(action === "quickSupplemental" ? "supplemental" : action === "quickFollowup" || retryKind === "followup" ? "followup" : "check");
    try { const saved = await save(); if (!saved) return; await request({ action, cardVersion: action === "quickFollowup" || action === "quickCheck" ? saved.card.contentVersion : undefined, ...extra }); }
    finally { modelLatch.current.leave(); setCalling(null); }
  }
  function allowNavigation(e: { preventDefault(): void }, href: string) {
    if (intentLatch.current.busy || mutation.current || answerLatch.current.busy) { e.preventDefault(); return; }
    if (dirty || answer.trim()) { e.preventDefault(); setLeaveIntent({ kind: "link", href }); }
  }
  function confirmLeave() {
    if (!leaveIntent || intentLatch.current.busy || mutation.current || answerLatch.current.busy) return;
    const intent = leaveIntent; setLeaveIntent(null);
    if (intent.kind === "link") router.push(intent.href);
    else void continueDeep(intent.explicitNew, true);
  }
  async function continueDeep(explicitNew = false, discardAnswer = false) {
    if (mutation.current || answerLatch.current.busy || intentLatch.current.busy) return;
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
    if (mutation.current || answerLatch.current.busy || !intentLatch.current.enter()) return;
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
    if (mutation.current || !intentLatch.current.enter()) return;
    setTransitioning(true);
    const revision = editRevision.current;
    try {
      const saved = await save(); if (!saved || !unchangedDraft(editRevision.current, revision)) return;
      const value = await request({ action: "cardExcerpt", cardVersion: saved.card.contentVersion, key, ...range });
      if (value && unchangedDraft(editRevision.current, revision) && value.card.contentVersion === dataRef.current.card.contentVersion) {
        const text = value.card.content.parts.find(p => p.key === key)?.text ?? "";
        edited.current = true; editRevision.current++;
        setDraft(d => ({ ...d, [key]: text })); setSelection(null);
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
    try { const ticket = { epoch: epoch.current, sequence: ++sequence.current }; const r = await fetch(`${endpoint}/quick`); const value = await r.json(); if (!r.ok) throw new Error(value.error); accept(value, ticket); setNotice("状态已更新，输入区保留你的文字；保存会提交这些文字。"); }
    catch (e) { setError(e instanceof Error ? e.message : "读取失败"); }
  }
  const latest = data.checkResults?.filter(r => r.cardVersion === data.card.contentVersion).at(-1);
  const quickMessages = data.session.messages.filter(m => m.stage === "quick");
  const gaps = latest?.results.filter(r => r.status !== "met").length ?? 0;
  const checksLeft = data.budget?.remaining.checks ?? null;
  const followupsLeft = data.budget?.remaining.followups ?? null;
  const failedOps = data.operations.slice(-4).filter(o => !["ok", "needs_development", "running"].includes(o.status));
  const passed = data.card.state === "passed";
  const slotLabel = (key: string) => { const slot = slots.find(s => s.key === key); return slot ? (requirements.subquestions.length > 1 ? `${slot.zh.slice(0, 14)}${slot.zh.length > 14 ? "…" : ""} · ${slot.label}` : slot.label) : key; };
  /** Put an answer (or the selected part of it) into a card field. An empty field keeps the
   * excerpt provenance on the server; a filled one is appended locally as the student's edit. */
  function place(message: { id: string; content: string }, key: string) {
    const range = selection?.messageId === message.id ? selection : { messageId: message.id, start: 0, end: message.content.length };
    const text = message.content.slice(range.start, range.end).trim();
    if (!text) return;
    const existing = (draft[key] ?? "").trim();
    if (!existing) { void excerpt(range, key); return; }
    const combined = `${existing}\n${text}`;
    if ([...combined].length > 600) { setError("这一栏最多 600 字，放不下了。可以只选中回答里的一段再放入。"); return; }
    edited.current = true; editRevision.current++;
    setDraft(d => ({ ...d, [key]: combined })); setSelection(null); setError("");
    setNotice(`已追加到「${slots.find(s => s.key === key)?.label ?? "卡片"}」，检查或保存时会一起保存。`);
  }
  return <main className="desk min-h-dvh">
    <header className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center justify-between gap-3 border-b bg-sheet/95 px-3 py-2 backdrop-blur">
      <div className="flex items-center gap-2"><Link href="/" onNavigate={e => allowNavigation(e, "/")} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"><ChevronLeft className="size-4" />练习</Link><span className="text-input" aria-hidden>/</span><h1 className="px-1 text-[15px] font-semibold">速刷主题卡片</h1><Badge variant="outline">{stateLabels[data.card.state]}</Badge></div>
      <div className="flex flex-wrap items-center gap-2">
        <span aria-live="polite" className="mr-1 text-[14px] text-muted-foreground">{dirty ? "有未保存的修改" : notice}</span>
        <Button variant="outline" disabled={saving || !active || transitioning} onClick={() => void save()}>{dirty ? "保存卡片" : "已保存"}</Button>
        <Button disabled={!active || transitioning || saving || (running && !passed) || (!passed && checksLeft === 0)} onClick={() => passed ? void continueDeep() : void model("quickCheck")}>{passed ? (data.defaultDeepId ? "打开作文" : "用这张卡写成作文") : running ? runningLabel : checksLeft === 1 ? "检查（还可 1 次）" : "检查"}</Button>
      </div>
    </header>
    <div className="mx-auto grid max-w-[1180px] items-start gap-8 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <p className="max-w-3xl font-serif text-[23px] leading-[1.45] text-pretty">{data.session.question?.text ?? data.session.prompt.text}</p>
        <p className="mt-3 text-sm text-muted-foreground">用自己的话把每一栏填上，中英文都可以。这里不打分，只看题目问的有没有答到。</p>
        {leaveIntent && <LeaveConfirmation answerOnly={leaveIntent.kind === "deep"} disabled={transitioning || saving || answering} onCancel={() => setLeaveIntent(null)} onLeave={confirmLeave} />}
        {error && <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-sheet p-3 text-sm">{error} <button className="underline" onClick={() => void refresh()}>刷新状态</button></p>}
        {!active && <div className="mt-4 flex items-center gap-3 text-sm">这份练习已{data.session.lifecycle === "closed" ? "关闭" : "暂放"}。<Button disabled={transitioning} onClick={() => void lifecycle("resume")}>恢复练习</Button></div>}
        {passed ? <div role="status" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-good-soft px-5 py-4">
          <div><p className="flex items-center gap-1.5 font-semibold text-good"><Check className="size-4" />题目问的都答到了</p><p className="mt-1 text-sm">下一步把这张卡写成完整作文，卡片内容会自动带进提纲。</p></div>
          <Button disabled={!active || transitioning || saving} onClick={() => void continueDeep()}>{data.defaultDeepId ? "打开作文" : "用这张卡写成作文"}</Button>
        </div> : latest && gaps > 0 ? <p role="status" className="mt-5 rounded-xl bg-warn-soft px-5 py-3.5 text-sm"><b className="font-semibold">还有 {gaps} 项没答完整</b>，已在下面标出。补上以后再检查一次。</p>
          : data.card.state === "unchecked" ? <p role="status" className="mt-5 rounded-xl bg-sunk px-5 py-3.5 text-sm text-muted-foreground">卡片改过了，还没有重新检查。</p> : null}
        <section aria-label="我的卡片" className="paper mt-5 space-y-8 px-6 py-7 sm:px-9">
          {requirements.subquestions.map((q, index) => {
            const result = latest?.results.find(r => r.id === q.key);
            return <fieldset key={q.key} className="space-y-3.5">
              <legend className="text-[16px] leading-relaxed font-semibold">{requirements.subquestions.length > 1 && <span className="mr-2 text-muted-foreground tabular-nums">{index + 1}</span>}{q.zh}</legend>
              <p className="font-serif text-[15px] text-muted-foreground italic">{q.en}</p>
              {result && <p className={cn("flex items-start gap-2 rounded-lg px-3 py-2 text-sm", result.status === "met" ? "bg-good-soft text-good" : "bg-warn-soft")}>
                <span className="shrink-0 font-semibold">{result.status === "met" ? "已满足" : "还需展开"}</span>{result.note && <span>{result.note}</span>}
              </p>}
              {slots.filter(s => s.requirementKey === q.key).map(s => {
                const empty = !(draft[s.key] ?? "").trim();
                return <div key={s.key}>
                  <div className="mb-1.5 flex items-baseline justify-between"><label htmlFor={s.key} className="text-sm font-medium">{s.label}</label><span aria-hidden className="text-xs text-faint tabular-nums">{[...(draft[s.key] ?? "")].length} / 600</span></div>
                  <textarea id={s.key} disabled={!active || transitioning} className={cn(fieldClass, result && result.status !== "met" && empty && "border-warn")} rows={3} value={draft[s.key] ?? ""} onChange={e => { edited.current = true; editRevision.current++; setDraft(d => ({ ...d, [s.key]: e.target.value })); }} />
                </div>;
              })}
            </fieldset>;
          })}
        </section>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {!passed && <Button size="sm" variant="outline" disabled={!active || transitioning || saving} onClick={() => void continueDeep()}>{data.defaultDeepId ? "打开作文" : "不检查，直接写成作文"}</Button>}
          {childGone && <Button size="sm" variant="outline" disabled={transitioning} onClick={() => void continueDeep(true)}>明确另开一次练习</Button>}
          <Button size="sm" variant="ghost" disabled={!active || transitioning || saving} onClick={() => void lifecycle("setAside")}>先放一放</Button>
          <Link className="px-2 py-1.5 text-[14px] text-muted-foreground underline underline-offset-4 hover:text-foreground" href="/cards" onNavigate={e => allowNavigation(e, "/cards")}>全部卡片</Link>
        </div>
      </div>
      <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
        <section className="surface space-y-4 p-5"><h2 className="text-[15px] font-semibold">卡住了？让教练问你一个问题</h2><p className="text-[14px] leading-relaxed text-muted-foreground">教练只提问，不替你写。回答之后，把有用的部分放进卡片。</p>
          {quickMessages.map(m => {
            if (m.role !== "user") return <div key={m.id} className="space-y-1.5 border-t pt-3.5"><p className="text-xs font-semibold text-coach">教练</p><p className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p></div>;
            const asked = quickMessages.find(q => q.id === m.replyToMessageId);
            const suggested = asked?.targetKey && slots.some(s => s.key === asked.targetKey) ? asked.targetKey : target;
            const chosen = placeTargets[m.id] ?? suggested;
            return <div key={m.id} className="space-y-2 border-t pt-3.5"><p className="text-xs text-muted-foreground">你的回答</p>
              <textarea aria-label="选择你的回答原文" readOnly rows={3} className={fieldClass} value={m.content} onSelect={e => { const t = e.currentTarget; setSelection(t.selectionEnd > t.selectionStart ? { messageId: m.id, start: t.selectionStart, end: t.selectionEnd } : null); }} />
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[14px] text-muted-foreground" htmlFor={`place-${m.id}`}>{selection?.messageId === m.id ? "把选中的部分放进" : "放进卡片的"}</label>
                <select id={`place-${m.id}`} disabled={transitioning} className="h-8 min-w-0 flex-1 rounded-md border border-input bg-sunk px-2 text-[14px]" value={chosen} onChange={e => setPlaceTargets(t => ({ ...t, [m.id]: e.target.value }))}>{slots.map(s => <option key={s.key} value={s.key}>{slotLabel(s.key)}</option>)}</select>
                <Button size="sm" variant="outline" disabled={!active || transitioning || saving} onClick={() => place(m, chosen)}>放入</Button>
              </div>
              <p className="text-xs text-faint">想只放一部分，先在上面选中那段文字。</p>
            </div>;
          })}
          {pendingAnswer && <form onSubmit={e => { e.preventDefault(); void sendAnswer(); }} className="space-y-2 border-t pt-3.5"><label htmlFor="quick-answer" className="text-sm font-medium">你的回答</label><textarea id="quick-answer" disabled={answering || transitioning || !active} required rows={3} placeholder="想到什么写什么，中英文都可以" className={fieldClass} value={answer} onChange={e => setAnswer(e.target.value)} /><Button type="submit" disabled={!active || !answer.trim() || answering || transitioning}>{answering ? "正在发送…" : "发送回答"}</Button></form>}
          {!pendingAnswer && (followupsLeft === 0
            ? <p className="border-t pt-3.5 text-[14px] text-muted-foreground">这张卡的追问已经用完，可以继续自己修改，或直接检查。</p>
            : <Button variant="outline" disabled={!active || transitioning || running} onClick={() => void model("quickFollowup")}>{running && runningKind === "followup" ? "教练正在追问…" : quickMessages.length ? "再问我一个问题" : "请教练问我"}{followupsLeft === 1 ? "（还可 1 次）" : ""}</Button>)}
        </section>
        {failedOps.map(o => <section key={o.id} className="surface space-y-2 p-5 text-sm"><p>{o.kind === "check" ? "检查" : "追问"}：{operationLabels[o.status] ?? o.status}</p>{["invalid_output", "timeout", "indeterminate"].includes(o.status) && <><Button variant="outline" size="sm" disabled={!active || transitioning || running || data.budget?.remaining.retries === 0} onClick={() => void model("quickRetry", { operationId: o.id })}>重试这次操作</Button>{data.budget?.remaining.retries === 0 && <p className="text-[14px] text-muted-foreground">重试次数已用完，可以修改卡片后重新检查。</p>}</>}</section>)}
        {data.budget && checksLeft === 0 && <section className="surface space-y-3 p-5 text-sm">
          <p className="font-medium">这张卡的检查次数已用完</p>
          <p className="text-[14px] text-muted-foreground">额度用完仍可编辑、保存或写成作文。</p>
          {data.budget.nextSupplementalAt && <p className="text-[14px] text-muted-foreground">补充检查最早可申请：{new Date(data.budget.nextSupplementalAt).toLocaleString("zh-CN", { timeZone: "Asia/Taipei" })}</p>}
          <Button size="sm" variant="outline" disabled={!active || transitioning || running || supplementalWaiting} onClick={() => void model("quickSupplemental")}>申请补充检查</Button>
        </section>}
      </aside>
    </div>
  </main>;
}
