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
import { Button } from "@/components/ui/button";

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
const fieldClass = "w-full rounded-lg border bg-background p-3 text-sm leading-relaxed focus-visible:outline-ring";
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
  const [target, setTarget] = useState(cardSlots(requirements)[0]?.key ?? "");
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
  async function excerpt() {
    if (!selection || mutation.current || !intentLatch.current.enter()) return;
    setTransitioning(true);
    const revision = editRevision.current;
    try {
      const saved = await save(); if (!saved || !unchangedDraft(editRevision.current, revision)) return;
      const value = await request({ action: "cardExcerpt", cardVersion: saved.card.contentVersion, key: target, ...selection });
      if (value && unchangedDraft(editRevision.current, revision) && value.card.contentVersion === dataRef.current.card.contentVersion) {
        const text = value.card.content.parts.find(p => p.key === target)?.text ?? "";
        edited.current = true; editRevision.current++;
        setDraft(d => ({ ...d, [target]: text })); setSelection(null);
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
  return <main className="min-h-screen bg-background">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
      <div className="flex items-center gap-4"><Link href="/" onNavigate={e => allowNavigation(e, "/")} className="text-sm">← 练习</Link><h1 className="font-semibold">速刷 · 主题卡片</h1><span className="text-xs text-muted-foreground">{stateLabels[data.card.state]}</span></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={saving || !active || transitioning} onClick={() => void save()}>{dirty ? "保存卡片" : "已保存"}</Button><Button disabled={!active || transitioning || saving || (running && data.card.state !== "passed")} onClick={() => data.card.state === "passed" ? void continueDeep() : void model("quickCheck")}>{data.card.state === "passed" ? (data.defaultDeepId ? "打开作文" : "用这张卡写成作文") : running ? runningLabel : "检查"}</Button></div>
    </header>
    <div className="mx-auto max-w-[1600px] px-5 py-6">
      <p className="mb-2 text-xs text-muted-foreground">练习题（非官方真题） · 不打分，只检查要求是否回答完整</p>
      <p className="max-w-4xl font-serif text-xl leading-relaxed">{data.session.question?.text ?? data.session.prompt.text}</p>
      {leaveIntent && <LeaveConfirmation answerOnly={leaveIntent.kind === "deep"} disabled={transitioning || saving || answering} onCancel={() => setLeaveIntent(null)} onLeave={confirmLeave} />}
      {error && <p role="alert" className="mt-4 rounded border border-destructive p-3 text-sm">{error} <button className="underline" onClick={() => void refresh()}>刷新状态</button></p>}
      <p aria-live="polite" className="my-3 text-xs text-muted-foreground">{dirty ? "有未保存的修改" : notice}</p>
      {!active && <div className="my-4 flex items-center gap-3 text-sm">这份练习已{data.session.lifecycle === "closed" ? "关闭" : "搁置"}。<Button disabled={transitioning} onClick={() => void lifecycle("resume")}>恢复练习</Button></div>}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(220px,1fr)_minmax(320px,1.6fr)_minmax(220px,1fr)]">
        <section className="space-y-4 rounded-xl border bg-sheet p-4"><h2 className="font-medium">和教练聊聊</h2><p className="text-xs text-muted-foreground">教练只追问。材料由你自己写入卡片。</p>
          {data.session.messages.filter(m => m.stage === "quick").map(m => <div key={m.id} className="space-y-2 border-t pt-3"><p className="text-xs text-muted-foreground">{m.role === "user" ? "你的回答" : "教练"}</p>{m.role === "user" ? <textarea aria-label="选择你的回答原文" readOnly className={fieldClass} value={m.content} onSelect={e => { const t = e.currentTarget; setSelection(t.selectionEnd > t.selectionStart ? { messageId: m.id, start: t.selectionStart, end: t.selectionEnd } : null); }} /> : <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p>}</div>)}
          {selection && <div className="space-y-2"><label className="text-xs" htmlFor="excerpt-target">将选中的原话放入</label><select disabled={transitioning} id="excerpt-target" className={fieldClass} value={target} onChange={e => setTarget(e.target.value)}>{slots.map(s => <option key={s.key} value={s.key}>{s.zh} · {s.label}</option>)}</select><Button variant="outline" disabled={!active || transitioning || saving} onClick={() => void excerpt()}>摘取原话</Button></div>}
          <Button variant="outline" disabled={!active || transitioning || running || !!pendingAnswer || data.budget?.remaining.followups === 0} onClick={() => void model("quickFollowup")}>{running && runningKind === "followup" ? "教练正在追问…" : "请教练看看"}{data.budget ? `（剩 ${data.budget.remaining.followups} 次）` : ""}</Button>
          {pendingAnswer && <form onSubmit={e => { e.preventDefault(); void sendAnswer(); }} className="space-y-2"><label htmlFor="quick-answer" className="text-sm">你的回答</label><textarea id="quick-answer" disabled={answering || transitioning || !active} required className={fieldClass} value={answer} onChange={e => setAnswer(e.target.value)} /><Button type="submit" disabled={!active || !answer.trim() || answering || transitioning}>发送回答</Button></form>}
        </section>
        <section className="space-y-5 rounded-xl border bg-sheet p-5"><h2 className="font-medium">我的卡片</h2>{requirements.subquestions.map(q => <fieldset key={q.key} className="space-y-3"><legend className="mb-2 text-sm font-medium">{q.zh}</legend><p className="text-xs text-muted-foreground">{q.en}</p>{slots.filter(s => s.requirementKey === q.key).map(s => <div key={s.key}><label htmlFor={s.key} className="mb-1 block text-xs">{s.label}</label><textarea id={s.key} disabled={!active || transitioning} className={fieldClass} rows={3} value={draft[s.key] ?? ""} onChange={e => { edited.current = true; editRevision.current++; setDraft(d => ({ ...d, [s.key]: e.target.value })); }} /><p className="text-right text-xs text-muted-foreground">{[...(draft[s.key] ?? "")].length}/600</p></div>)}</fieldset>)}</section>
        <aside className="space-y-4 rounded-xl border bg-sheet p-4"><h2 className="font-medium">检查结果</h2><p className="text-sm">{stateLabels[data.card.state]}</p>{latest?.results.map(r => <div key={r.id} className="border-t pt-3 text-sm"><p>{r.status === "met" ? "已满足" : "还需展开"} · {requirements.subquestions.find(q => q.key === r.id)?.zh ?? r.id}</p>{r.note && <p className="mt-1 text-muted-foreground">{r.note}</p>}</div>)}
          {data.operations.slice(-4).map(o => <div key={o.id} className="border-t pt-3 text-sm"><p>{o.kind === "check" ? "检查" : "追问"}：{operationLabels[o.status] ?? o.status}</p>{["invalid_output", "timeout", "indeterminate"].includes(o.status) && <Button className="mt-2" variant="outline" disabled={!active || transitioning || running || data.budget?.remaining.retries === 0} onClick={() => void model("quickRetry", { operationId: o.id })}>重试这次操作</Button>}</div>)}
          {data.budget && <div className="space-y-2 border-t pt-3 text-xs text-muted-foreground"><p>剩余检查 {data.budget.remaining.checks} 次 · 技术重试 {data.budget.remaining.retries} 次</p>{data.budget.nextSupplementalAt && <p>补充检查最早可申请：{new Date(data.budget.nextSupplementalAt).toLocaleString("zh-CN", { timeZone: "Asia/Taipei" })}</p>}<p>额度用完仍可编辑、保存或写成作文。</p></div>}
          <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!active || transitioning || running || supplementalWaiting} onClick={() => void model("quickSupplemental")}>申请补充检查</Button><Button variant="outline" disabled={!active || transitioning || saving} onClick={() => void continueDeep()}>{data.defaultDeepId ? "打开作文" : "用这张卡写成作文"}</Button>{childGone && <Button variant="outline" disabled={transitioning} onClick={() => void continueDeep(true)}>明确另开一次练习</Button>}<Button variant="ghost" disabled={!active || transitioning || saving} onClick={() => void lifecycle("setAside")}>搁置</Button><Button variant="ghost" onClick={() => void refresh()}>刷新状态</Button><Link className="p-2 text-sm underline" href="/cards" onNavigate={e => allowNavigation(e, "/cards")}>复习卡片</Link></div>
        </aside>
      </div>
    </div>
  </main>;
}
