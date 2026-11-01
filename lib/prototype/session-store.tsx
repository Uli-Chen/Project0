"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { EssayKind } from "./types";
import type { SessionState } from "@/lib/pipeline/types";
import type { AgentAction } from "@/lib/pipeline/schemas";
import { setSlot } from "@/lib/pipeline/outline";
import { mergeSessionState, type EditGenerations } from "@/lib/pipeline/client-state";
export type { SessionState } from "@/lib/pipeline/types";
export { getSlot, setSlot } from "@/lib/pipeline/outline";

type SaveStatus = "saved" | "saving" | "unsaved" | "error";
type ApiResult = { session?: SessionState; busy?: boolean; error?: string };
class RequestError extends Error { constructor(message: string, public status = 0, public data: ApiResult = {}) { super(message); } }
async function requestJson(url: string, options?: RequestInit, timeout = 15000): Promise<ApiResult> {
  try {
    const response = await fetch(url, { ...options, signal: options?.signal ?? AbortSignal.timeout(timeout) });
    let data: ApiResult;
    try { data = await response.json(); } catch { throw new RequestError("服务返回异常，请稍后重试。你的文字仍在当前页面。"); }
    if (!response.ok) throw new RequestError(data.error ?? "请求未完成，请重试。", response.status, data);
    return data;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    if (error instanceof Error && /timeout|abort/i.test(error.name)) throw new RequestError("连接超时，请重试。你的文字仍在当前页面。");
    throw new RequestError("网络连接中断，请检查网络后重试。你的文字仍在当前页面。");
  }
}
function useSessionController(initialState: SessionState) {
  const initialPending = initialState.pendingAction;
  const [state, setState] = useState(initialState);
  const [coachBusy, setCoachBusy] = useState(Boolean(initialPending && !initialPending.error));
  const [pendingActionName, setPendingActionName] = useState<AgentAction["action"] | null>(initialPending?.input.action ?? null);
  const [error, setError] = useState<string | null>(initialPending?.error ?? null);
  const [failedInput, setFailedInput] = useState<string | null>(initialPending && "text" in initialPending.input ? initialPending.input.text ?? null : null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const ref = useRef(initialState);
  const edits = useRef(0);
  const changed = useRef<EditGenerations>({ original: 0, revision: 0, outline: 0, nudgesEnabled: 0 });
  const savedEdits = useRef(0);
  const busy = useRef(Boolean(initialPending && !initialPending.error));
  const conflict = useRef(false);
  const lastAction = useRef<AgentAction | null>(initialPending?.input ?? null);
  const lastRequestId = useRef<string | null>(initialPending?.requestId ?? null);
  const actionController = useRef<AbortController | null>(null);
  const pendingWrite = useRef<{ id: string; generation: number; body: string } | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback((fn: (s: SessionState) => SessionState) => { const next = fn(ref.current); ref.current = next; setState(next); }, []);
  const enqueue = useCallback(<T,>(work: () => Promise<T>): Promise<T> => { const result = queue.current.then(work); queue.current = result.catch(() => undefined); return result; }, []);
  const merge = useCallback((incoming: SessionState, generation: number) => update(local => mergeSessionState(local, incoming, changed.current, generation)), [update]);

  const saveNow = useCallback(async () => {
    if (conflict.current) throw new RequestError("练习已在其他页面更新。请下载当前草稿后刷新，避免覆盖其他页面的修改。");
    setSaveStatus("saving");
    try {
      // Keep the same write ID after an ambiguous network failure. The server can safely acknowledge it twice.
      for (let attempt = 0; attempt < 3; attempt++) {
        if (!pendingWrite.current) {
          const snapshot = ref.current;
          const requestId = crypto.randomUUID();
          pendingWrite.current = { id: requestId, generation: edits.current, body: JSON.stringify({ requestId, version: snapshot.version, drafts: snapshot.drafts, elapsed: snapshot.elapsed, outline: snapshot.outline, nudgesEnabled: snapshot.nudgesEnabled }) };
        }
        const write = pendingWrite.current;
        let data: ApiResult;
        try { data = await requestJson(`/api/sessions/${ref.current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: write.body }); }
        catch (failure) {
          if (failure instanceof RequestError && failure.status === 409) { if (failure.data.session) conflict.current = true; else pendingWrite.current = null; }
          throw failure;
        }
        if (!data.session) throw new RequestError("保存响应不完整，请重试。");
        merge(data.session, write.generation); savedEdits.current = write.generation; pendingWrite.current = null;
        if (edits.current === savedEdits.current) break;
      }
      setSaveStatus(edits.current === savedEdits.current ? "saved" : "unsaved");
    } catch (err) { setSaveStatus("error"); throw err; }
  }, [merge]);
  const save = useCallback(async () => {
    if (busy.current && !actionController.current) { setError("教练正在处理上次请求。完成后会自动保存，请稍候再离开。"); return false; }
    try { await enqueue(saveNow); if (edits.current !== savedEdits.current) { setError("还有未保存的修改，请稍候重试或下载草稿。"); return false; } if (!lastAction.current) setError(null); return true; }
    catch (err) { setError(err instanceof Error ? err.message : "保存失败，请检查网络后重试。"); return false; }
  }, [enqueue, saveNow]);
  const edit = useCallback((field: keyof EditGenerations, fn: (s: SessionState) => SessionState) => {
    if (busy.current && lastAction.current?.action === "evaluate") return;
    edits.current++; changed.current[field] = edits.current; update(fn); setSaveStatus("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void save(); }, 800);
  }, [save, update]);

  const perform = useCallback(async (input: AgentAction, requestId = crypto.randomUUID()) => {
    if (busy.current) return;
    const recovering = lastRequestId.current === requestId;
    busy.current = true; setCoachBusy(true); setPendingActionName(input.action); setError(null);
    lastAction.current = input; lastRequestId.current = requestId; setFailedInput("text" in input ? input.text ?? null : null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      await enqueue(async () => {
        if (recovering) {
          const latest = await requestJson(`/api/sessions/${ref.current.id}`, { cache: "no-store" });
          if (latest.session?.completedRequests?.includes(requestId)) { merge(latest.session, savedEdits.current); return; }
          if (latest.session?.pendingAction?.requestId === requestId) {
            merge(latest.session, savedEdits.current);
            if (latest.busy) throw new RequestError("上次请求仍在处理中，结果会自动同步。请稍候。");
          }
        }
        await saveNow();
        const generation = savedEdits.current;
        const messageStage = ref.current.stage === "prewriting" ? "prewriting" as const : ref.current.stage === "revising" ? "revision" as const : "writing" as const;
        update(s => ({ ...s, pendingAction: { requestId, input, startedAt: new Date().toISOString() } }));
        if (["prewrite", "chat", "express", "clarify", "polish", "check", "issue"].includes(input.action)) {
          const content = "text" in input ? input.text ?? "再给点提示" : ({ clarify: "理清这段", polish: "润色这句", check: "检查这段" } as Record<string, string>)[input.action];
          update(s => ({ ...s, messages: [...s.messages.filter(m => !m.id.startsWith("pending-")), { id: `pending-${requestId}`, role: "user", stage: input.action === "issue" ? "issue" : messageStage, content, ...("selection" in input ? { quote: input.selection } : {}), ...(input.action === "chat" ? { quote: input.quote } : {}), ...(input.action === "issue" ? { issueRank: input.rank } : {}) }] }));
        }
        if (input.action === "evaluate") update(s => ({ ...s, stage: input.kind === "revision" ? "re_evaluating" : "evaluating", submitted: { ...s.submitted, [input.kind]: s.submitted[input.kind] ?? s.drafts[input.kind] }, evalStep: "scoring", evalError: null }));
        const controller = new AbortController(); actionController.current = controller;
        try {
          const data = await requestJson(`/api/sessions/${ref.current.id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, requestId }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(280000)]) });
          if (!data.session) throw new RequestError("请求响应不完整，请重试。");
          merge(data.session, generation);
        } catch (failure) {
          if (failure instanceof RequestError && failure.data.session) merge(failure.data.session, generation);
          if (!ref.current.completedRequests?.includes(requestId)) throw failure;
        } finally { actionController.current = null; }
      });
      lastAction.current = null; setFailedInput(null); setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "请求失败，请检查网络后重试。";
      setError(message);
      if (input.action === "evaluate") update(s => ["evaluating", "re_evaluating"].includes(s.stage) ? ({ ...s, evalError: message }) : s);
    } finally { busy.current = false; setCoachBusy(false); setPendingActionName(null); }
    if (ref.current.completedRequests?.includes(requestId) && edits.current !== savedEdits.current) void save();
  }, [enqueue, merge, saveNow, update, save]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (edits.current !== savedEdits.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("beforeunload", warn); if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []);
  const needsSync = state.reviewStatus === "pending" || Boolean(state.pendingAction && (!state.pendingAction.error || coachBusy)) || (["evaluating", "re_evaluating"].includes(state.stage) && (!state.evalError || coachBusy));
  useEffect(() => {
    if (!needsSync) return;
    let alive = true;
    let inFlight = false;
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const data = await requestJson(`/api/sessions/${initialState.id}`, { cache: "no-store" }, 10000);
        if (!alive || !data.session) return;
        const next = data.session;
        if (actionController.current && !next.pendingAction && !next.completedRequests?.includes(lastRequestId.current ?? "") && !data.busy && next.reviewStatus !== "failed") return;
        if (next.version < ref.current.version) return;
        const evaluating = ["evaluating", "re_evaluating"].includes(next.stage);
        if (!data.busy) {
          if (next.pendingAction && !next.pendingAction.error) next.pendingAction.error = "上次请求已中断，你的文字已保留，可以重试。";
          if (evaluating && !next.evalError) next.evalError = next.pendingAction?.error ?? "上次评估已中断。作文已保存，可以重新评估。";
        }
        merge(next, savedEdits.current);
        if (next.completedRequests?.includes(lastRequestId.current ?? "")) {
          actionController.current?.abort();
          if (!actionController.current) { busy.current = false; setCoachBusy(false); setPendingActionName(null); lastAction.current = null; setFailedInput(null); setError(null); }
          if (edits.current !== savedEdits.current) void save();
        } else if (!actionController.current) {
          busy.current = Boolean(data.busy); setCoachBusy(Boolean(data.busy));
          if (!data.busy && next.pendingAction?.error) setError(next.pendingAction.error);
        }
      } catch (failure) {
        if (!alive) return;
        const message = failure instanceof Error ? failure.message : "同步失败，请检查网络后重试。";
        setError(message);
        if (!actionController.current) { busy.current = false; setCoachBusy(false); update(s => ["evaluating", "re_evaluating"].includes(s.stage) ? { ...s, evalError: message } : s); }
      } finally { inFlight = false; }
    };
    const initialTimer = setTimeout(() => { void poll(); }, 1500);
    const timer = setInterval(() => { void poll(); }, 3000);
    return () => { alive = false; clearTimeout(initialTimer); clearInterval(timer); };
  }, [needsSync, initialState.id, merge, update, save]);

  const essayKind: EssayKind = state.stage === "revising" || state.stage === "re_evaluating" ? "revision" : "original";
  const setDraft = useCallback((kind: EssayKind, text: string) => edit(kind, s => ({ ...s, drafts: { ...s.drafts, [kind]: text } })), [edit]);
  const tick = useCallback((kind: EssayKind) => update(s => ({ ...s, elapsed: { ...s.elapsed, [kind]: s.elapsed[kind] + 1 } })), [update]);
  return { state, coachBusy, pendingActionName, essayKind, error, saveStatus, failedInput,
    actions: {
      sendPrewrite: (text: string) => perform({ action: "prewrite", text }),
      editOutline: (path: string, text: string) => edit("outline", s => ({ ...s, outline: { ...setSlot(s.outline, path, text, "用户编辑"), userEdited: true } })),
      startWriting: () => perform({ action: "startWriting" }), setDraft, tick, markSaved: save, save,
      assist: (action: "clarify" | "polish" | "check", selection: string) => perform({ action, selection }),
      express: (text: string) => perform({ action: "express", text }),
      chat: (text: string, quote?: string) => perform({ action: "chat", text, quote }),
      decideSuggestion: (id: string, status: "accepted" | "dismissed") => perform({ action: "suggestion", id, status }),
      requestNudge: (kind: EssayKind, paragraphIndex: number) => { if (!busy.current && ref.current.nudgesEnabled && !ref.current.nudgedParagraphs[`${kind}:${paragraphIndex}`]) void perform({ action: "nudge", kind, paragraphIndex }); },
      dismissNudge: () => perform({ action: "dismissNudge" }),
      setNudgesEnabled: (on: boolean) => edit("nudgesEnabled", s => ({ ...s, nudgesEnabled: on })),
      submit: (kind: EssayKind) => perform({ action: "evaluate", kind }),
      retryEvaluation: () => perform({ action: "evaluate", kind: ref.current.stage === "re_evaluating" ? "revision" : "original" }, lastAction.current?.action === "evaluate" ? lastRequestId.current ?? undefined : undefined),
      retryReview: () => perform({ action: "retryReview" }),
      startRevision: () => perform({ action: "startRevision" }),
      setActiveIssue: (rank: number) => update(s => ({ ...s, activeIssue: rank })),
      issueAction: (rank: number, intent: "more" | "attempt" | "ask", text?: string) => perform({ action: "issue", rank, intent, text }),
      finish: () => perform({ action: "finish" }),
      rate: (useful: number | null, mine: "yes" | "partly" | "no" | null, comment: string) => perform({ action: "rating", useful, mine, comment }),
      retry: () => lastAction.current ? perform(lastAction.current, lastRequestId.current ?? undefined) : save(),
      downloadDraft: () => { const s = ref.current; const blob = new Blob([`${s.prompt.text}\n\n原稿\n${s.drafts.original}\n\n改写稿\n${s.drafts.revision}`], { type: "text/plain;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `writemind-${s.id}.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); },
      hasUnsaved: () => edits.current !== savedEdits.current,
      clearError: () => setError(null),
    },
  };
}
type SessionContextValue = ReturnType<typeof useSessionController>;
const SessionContext = createContext<SessionContextValue | null>(null);
export function SessionProvider({ initialState, children }: { initialState: SessionState; children: ReactNode }) { const value = useSessionController(initialState); return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>; }
export function useSession() { const value = useContext(SessionContext); if (!value) throw new Error("useSession must be used inside SessionProvider"); return value; }
