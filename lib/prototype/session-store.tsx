"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { addOrphan, coachDraftKey, essayLeftoverKey, joinDraft, readLocalDraft, takeOrphan, writeLocalDraft } from "../drafts/local-draft";
import type { EssayKind } from "./types";
import type { SessionState } from "@/lib/pipeline/types";
import type { AgentAction } from "@/lib/pipeline/schemas";
import { getSlot, setSlot } from "@/lib/pipeline/outline";
import { outlineGroups } from "@/lib/learning/prewrite-guidance";
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
    // Keep the HTTP status even for a non-JSON body (e.g. a proxy's 413 page) so callers can tell a rejection from a lost response.
    try { data = await response.json(); } catch { throw new RequestError("服务返回异常，请稍后重试。你的文字仍在当前页面。", response.ok ? 0 : response.status); }
    if (!response.ok) throw new RequestError(data.error ?? "请求未完成，请重试。", response.status, data);
    return data;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    if (error instanceof Error && /timeout|abort/i.test(error.name)) throw new RequestError("连接超时，请重试。你的文字仍在当前页面。");
    throw new RequestError("网络连接中断，请检查网络后重试。你的文字仍在当前页面。");
  }
}
/** Server-side draft limit (draftSchema in lib/pipeline/schemas.ts); the editor shows and enforces it. */
export const DRAFT_MAX_CHARS = 30000;
/** After a failed autosave, resend the exact same write (same request ID) only when the outcome is
 * unknown. A definite rejection was never written: drop it so the next save is built from the
 * current text instead of resending the rejected snapshot forever. */
export function pendingWriteAfterFailure(status: number, conflictSession: boolean): "keep" | "drop" | "conflict" {
  if (status === 409) return conflictSession ? "conflict" : "drop";
  if (status === 400 || status === 413 || status === 422) return "drop";
  return "keep";
}
/** The textarea pushes every keystroke here, so outline text is dirty, autosaved and leave-protected while it is typed. */
export function applyOutlineEdit(state: SessionState, path: string, text: string): SessionState {
  return { ...state, outline: { ...setSlot(state.outline, path, text, "用户编辑"), userEdited: true } };
}
/** Plain-text backup of everything that may exist only in this tab: essay, outline and unsent coach text. */
export function draftBackupText(s: Pick<SessionState, "prompt" | "outline" | "drafts">, unsent: { composer?: string; failed?: string | null } = {}): string {
  const outline = outlineGroups(s.prompt.questionType).flatMap(group => group.slots.flatMap(slot => {
    const text = getSlot(s.outline, slot.path)?.text;
    return text ? [`${group.title}${slot.label ? ` · ${slot.label}` : ""}：${text}`] : [];
  }));
  const coach = [...new Set([unsent.failed, unsent.composer].map(t => t?.trim() ?? "").filter(Boolean))];
  return [s.prompt.text, `提纲\n${outline.length ? outline.join("\n") : "（空）"}`, `原稿\n${s.drafts.original}`, `改写稿\n${s.drafts.revision}`,
    ...(coach.length ? [`未发送给教练的文字\n${coach.join("\n\n")}`] : [])].join("\n\n");
}
/** Whether the server has recorded this request (pending, failed with a stored error, or done). */
export function serverHasRequest(session: SessionState | undefined | null, requestId: string): boolean {
  return Boolean(session && (session.pendingAction?.requestId === requestId || session.completedRequests?.includes(requestId)));
}
/** Where a failed coach message lives after the failure.
 * "server": recorded there; retry reuses its request ID.
 * "absent": the server certainly never got it (pre-send save failed, or the server answered without recording it),
 *   so the text goes back into the composer.
 * "unknown": it may have arrived; keep a leave-protected local copy and retry with the same ID. */
export function failedSendState({ acknowledged, sent, knownAbsent, status, answeredWithSession }: {
  acknowledged: boolean; sent: boolean; knownAbsent: boolean; status: number; answeredWithSession: boolean;
}): "server" | "absent" | "unknown" {
  if (acknowledged) return "server";
  if (!sent) return knownAbsent ? "absent" : "unknown";
  if (answeredWithSession || (status >= 400 && status < 500)) return "absent";
  return "unknown";
}
/** A failed request must not replace the student's newer unsent message. */
export function recoverComposerDraft(currentDraft: string, input: AgentAction): string {
  if (currentDraft || !("text" in input) || !input.text?.trim() || ("intent" in input && input.intent === "more")) return currentDraft;
  return input.text;
}

function useSessionController(initialState: SessionState) {
  const initialPending = initialState.pendingAction;
  const [state, setState] = useState(initialState);
  const [coachBusy, setCoachBusy] = useState(Boolean(initialPending && !initialPending.error));
  const [pendingActionName, setPendingActionName] = useState<AgentAction["action"] | null>(initialPending?.input.action ?? null);
  const [error, setError] = useState<string | null>(initialPending?.error ?? null);
  const [failedInput, setFailedInput] = useState<string | null>(initialPending && "text" in initialPending.input ? initialPending.input.text ?? null : null);
  const [composerDraft, setComposerDraftState] = useState(initialPending?.retryable === false && "text" in initialPending.input ? initialPending.input.text ?? "" : "");
  const composerDraftRef = useRef(composerDraft);
  const draftKey = coachDraftKey(initialState.id);
  // After the page is gone, a late request may only add its text to the orphan slot: a newer page owns the box key.
  const mounted = useRef(true);
  const setComposerDraft = useCallback((text: string) => {
    if (!mounted.current) { if (text.trim() && text !== composerDraftRef.current) addOrphan(draftKey, text); composerDraftRef.current = text; return; }
    composerDraftRef.current = text; setComposerDraftState(text); writeLocalDraft(draftKey, text);
  }, [draftKey]);
  // A sent coach message the server has not confirmed yet. The composer is already empty, so this is
  // the only copy: it counts as unsent text for leave protection and the backup until the server has it.
  const unconfirmed = useRef<{ requestId: string; text: string } | null>(null);
  const [unconfirmedInput, setUnconfirmedInputState] = useState<string | null>(null);
  const setUnconfirmed = useCallback((next: { requestId: string; text: string } | null) => { unconfirmed.current = next; setUnconfirmedInputState(next?.text ?? null); }, []);
  const confirmDelivered = useCallback((session: SessionState | undefined | null) => {
    if (unconfirmed.current && serverHasRequest(session, unconfirmed.current.requestId)) setUnconfirmed(null);
  }, [setUnconfirmed]);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  /** Essay text that could not be saved after an earlier visit was left (JSON of drafts and outline). */
  const [leftover, setLeftover] = useState<string | null>(null);
  const lifecycleChanging = useRef(false);
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
    if (conflict.current) throw new RequestError("练习已在其他页面更新。请先备份当前内容再刷新，避免覆盖其他页面的修改。");
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
          if (failure instanceof RequestError) {
            const next = pendingWriteAfterFailure(failure.status, Boolean(failure.data.session));
            if (next === "conflict") conflict.current = true;
            else if (next === "drop") pendingWrite.current = null;
            const s = ref.current;
            if (next === "drop" && failure.status !== 409 && (failure.status === 413 || s.drafts.original.length > DRAFT_MAX_CHARS || s.drafts.revision.length > DRAFT_MAX_CHARS)) {
              throw new RequestError(`正文超过 ${DRAFT_MAX_CHARS.toLocaleString()} 字符，无法保存。删减后会自动保存。`, failure.status, failure.data);
            }
          }
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
    if (lifecycleChanging.current) return false;
    if (ref.current.lifecycle !== "open" && edits.current === savedEdits.current && !pendingWrite.current) return true;
    if (busy.current && !actionController.current) { setError("教练正在处理上次请求。完成后会自动保存，请稍候再离开。"); return false; }
    try { await enqueue(saveNow); if (edits.current !== savedEdits.current) { setError("还有未保存的修改，请稍候重试或备份当前内容。"); return false; } if (!lastAction.current) setError(null); return true; }
    catch (err) { setError(err instanceof Error ? err.message : "保存失败，请检查网络后重试。"); return false; }
  }, [enqueue, saveNow]);
  const edit = useCallback((field: keyof EditGenerations, fn: (s: SessionState) => SessionState) => {
    if (lifecycleChanging.current || ref.current.lifecycle !== "open" || (busy.current && lastAction.current?.action === "evaluate")) return;
    edits.current++; changed.current[field] = edits.current; update(fn); setSaveStatus("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void save(); }, 800);
  }, [save, update]);

  const perform = useCallback(async (input: AgentAction, requestId = crypto.randomUUID()) => {
    if (busy.current || lifecycleChanging.current) return;
    if (ref.current.lifecycle !== "open") { setError("请先恢复练习，再继续操作。"); return; }
    const recovering = lastRequestId.current === requestId;
    busy.current = true; setCoachBusy(true); setPendingActionName(input.action); setError(null);
    lastAction.current = input; lastRequestId.current = requestId; setFailedInput("text" in input ? input.text ?? null : null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // The composer clears itself right after onSend; keep the typed text until the server has it.
    const typed = recoverComposerDraft("", input);
    if (typed && !recovering) setUnconfirmed({ requestId, text: typed });
    const progress = { sent: false, knownAbsent: !recovering, acknowledged: false, answeredWithSession: false, status: 0 };
    try {
      await enqueue(async () => {
        if (recovering) {
          const latest = await requestJson(`/api/sessions/${ref.current.id}`, { cache: "no-store" });
          progress.acknowledged = serverHasRequest(latest.session, requestId); progress.knownAbsent = !progress.acknowledged;
          confirmDelivered(latest.session);
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
          const content = "intent" in input && input.intent === "more" ? "（请求提示）" : "text" in input ? input.text ?? "再给点提示" : ({ clarify: "理清这段", polish: "润色这句", check: "检查这段" } as Record<string, string>)[input.action];
          update(s => ({ ...s, messages: [...s.messages.filter(m => !m.id.startsWith("pending-")), { id: `pending-${requestId}`, role: "user", stage: input.action === "issue" ? "issue" : messageStage, content, ...("selection" in input ? { quote: input.selection } : {}), ...(input.action === "chat" ? { quote: input.quote } : {}), ...(input.action === "issue" ? { issueRank: input.rank } : {}) }] }));
        }
        if (input.action === "evaluate") update(s => ({ ...s, stage: input.kind === "revision" ? "re_evaluating" : "evaluating", submitted: { ...s.submitted, [input.kind]: s.submitted[input.kind] ?? s.drafts[input.kind] }, evalStep: "scoring", evalError: null }));
        const controller = new AbortController(); actionController.current = controller;
        progress.sent = true;
        try {
          const data = await requestJson(`/api/sessions/${ref.current.id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, requestId }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(280000)]) });
          if (!data.session) throw new RequestError("请求响应不完整，请重试。");
          merge(data.session, generation);
        } catch (failure) {
          if (failure instanceof RequestError) {
            progress.status = failure.status;
            if (failure.data.session) {
              progress.acknowledged = serverHasRequest(failure.data.session, requestId); progress.answeredWithSession = !progress.acknowledged;
              confirmDelivered(failure.data.session);
              merge(failure.data.session, generation);
            }
          }
          if (!ref.current.completedRequests?.includes(requestId)) throw failure;
        } finally { actionController.current = null; }
      });
      lastAction.current = null; setFailedInput(null); setError(null);
      if (unconfirmed.current?.requestId === requestId) setUnconfirmed(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "请求失败，请检查网络后重试。";
      setError(message);
      update(s => s.messages.some(m => m.id.startsWith("pending-")) ? { ...s, messages: s.messages.filter(m => !m.id.startsWith("pending-")) } : s);
      const where = failedSendState(progress);
      if (where === "server" && ref.current.pendingAction?.requestId === requestId && ref.current.pendingAction.retryable === false) {
        const recovered = recoverComposerDraft(composerDraftRef.current, input);
        if (recovered !== composerDraftRef.current) setComposerDraft(recovered);
      } else if (where === "absent" && typed) {
        // The server never got it: put the words back where the student typed them, unless they already
        // started a new message. Then the failed text stays in the notice and leave protection, and 重试 resends it.
        const recovered = recoverComposerDraft(composerDraftRef.current, input);
        if (recovered !== composerDraftRef.current) {
          setComposerDraft(recovered); setUnconfirmed(null);
          lastAction.current = null; lastRequestId.current = null; setFailedInput(null);
          update(s => s.pendingAction?.requestId === requestId ? { ...s, pendingAction: null } : s);
        }
      }
      if (input.action === "evaluate") update(s => ["evaluating", "re_evaluating"].includes(s.stage) ? ({ ...s, evalError: message }) : s);
    } finally { busy.current = false; setCoachBusy(false); setPendingActionName(null); }
    if (ref.current.completedRequests?.includes(requestId) && edits.current !== savedEdits.current) void save();
    return ref.current.completedRequests?.includes(requestId) ?? false;
  }, [enqueue, merge, saveNow, update, save, setComposerDraft, setUnconfirmed, confirmDelivered]);

  const changeLifecycle = useCallback(async (action: "setAside" | "resume" | "close") => {
    if (busy.current || lifecycleChanging.current) return false;
    lifecycleChanging.current = true; setLifecycleBusy(true); setError(null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      await enqueue(async () => {
        // Freeze new local edits until both the existing save queue and this
        // transition finish. A failed/conflicted save must never close the draft.
        if (edits.current !== savedEdits.current || pendingWrite.current) await saveNow();
        if (edits.current !== savedEdits.current) throw new RequestError("还有未保存的修改，请先保存或备份当前内容。");
        const generation = savedEdits.current;
        const data = await requestJson(`/api/sessions/${ref.current.id}/lifecycle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
        if (!data.session) throw new RequestError("状态更新响应不完整，请重试。");
        merge(data.session, generation);
      });
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "状态更新失败，草稿仍保留在当前页面。");
      return false;
    } finally { lifecycleChanging.current = false; setLifecycleBusy(false); }
  }, [enqueue, merge, saveNow]);

  // Back/forward can show this page from the router cache with the state it had before it was left,
  // older than what was saved on the way out. Read the server copy once on arrival; fields edited
  // since the read started stay local.
  useEffect(() => {
    let alive = true;
    const generation = edits.current;
    void requestJson(`/api/sessions/${ref.current.id}`, { cache: "no-store" })
      .then(data => { if (alive && data.session && data.session.version > ref.current.version) merge(data.session, generation); })
      .catch(() => { /* the page keeps working on what it has; the next save reports a real conflict */ });
    return () => { alive = false; };
  }, [merge]);
  // Unsent coach text left behind by the back button (or any exit) comes back when the page does.
  // The box is emptied when its text is sent and refilled only if the send failed, so what is stored is unsent.
  useEffect(() => {
    mounted.current = true;
    const stored = joinDraft(readLocalDraft(draftKey), takeOrphan(draftKey));
    if (stored.trim() && stored !== composerDraftRef.current) setComposerDraft(joinDraft(composerDraftRef.current, stored));
    const left = readLocalDraft(essayLeftoverKey(ref.current.id));
    if (left) setLeftover(left);
    return () => { mounted.current = false; };
  }, [draftKey, setComposerDraft]);
  // Leaving by the back button skips the page's leave checks: send any pending edit right away
  // instead of dropping it with the debounce timer.
  // If a server-side coach request is still running, wait for it in the background and save after it.
  // If the save still fails (a conflict, the network), the text is kept as a leftover that the next
  // visit offers back; it is never applied by itself, so it cannot overwrite newer work.
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (edits.current === savedEdits.current && !pendingWrite.current) return;
    void (async () => {
      for (let round = 0; round < 40 && busy.current && !actionController.current; round++) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        try {
          const data = await requestJson(`/api/sessions/${ref.current.id}`, { cache: "no-store" }, 10000);
          if (data.session) merge(data.session, savedEdits.current);
          if (!data.busy) busy.current = false;
        } catch { /* try again */ }
      }
      if (await save()) return;
      const s = ref.current;
      writeLocalDraft(essayLeftoverKey(s.id), JSON.stringify({ drafts: s.drafts, outline: s.outline }));
    })();
  }, [save, merge]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (edits.current !== savedEdits.current || composerDraftRef.current.trim() || unconfirmed.current) { event.preventDefault(); event.returnValue = ""; } };
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
        confirmDelivered(next);
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
  }, [needsSync, initialState.id, merge, update, save, confirmDelivered]);

  const essayKind: EssayKind = state.stage === "revising" || state.stage === "re_evaluating" ? "revision" : "original";
  const setDraft = useCallback((kind: EssayKind, text: string) => edit(kind, s => ({ ...s, drafts: { ...s.drafts, [kind]: text } })), [edit]);
  const tick = useCallback((kind: EssayKind) => update(s => ({ ...s, elapsed: { ...s.elapsed, [kind]: s.elapsed[kind] + 1 } })), [update]);
  const failedText = () => unconfirmed.current?.text || (lastAction.current ? recoverComposerDraft("", lastAction.current) : "");
  return { state, coachBusy, lifecycleBusy, leftover, composerDraft, unconfirmedInput, pendingActionName, essayKind, error, saveStatus, failedInput,
    actions: {
      changeLifecycle, setComposerDraft,
      hasUnsentComposer: () => Boolean(composerDraftRef.current.trim() || unconfirmed.current),
      morePrewrite: () => perform({ action: "prewrite", text: "", intent: "more" }),
      sendPrewrite: (text: string) => perform({ action: "prewrite", text }),
      editOutline: (path: string, text: string) => edit("outline", s => applyOutlineEdit(s, path, text)),
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
      startRevision: (options?: { openIssue?: number }) => perform({ action: "startRevision", ...options }),
      setActiveIssue: (rank: number) => update(s => ({ ...s, activeIssue: rank })),
      issueAction: (rank: number, intent: "more" | "attempt" | "ask", text?: string) => perform({ action: "issue", rank, intent, text }),
      finish: () => perform({ action: "finish" }),
      rate: (useful: number | null, mine: "yes" | "partly" | "no" | null, comment: string) => perform({ action: "rating", useful, mine, comment }),
      retry: () => lastAction.current ? perform(lastAction.current, ref.current.pendingAction?.retryable === false ? undefined : lastRequestId.current ?? undefined) : save(),
      downloadDraft: () => {
        const s = ref.current;
        const blob = new Blob([draftBackupText(s, { composer: composerDraftRef.current, failed: failedText() })], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `writemind-${s.id}.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        if (conflict.current) setError("已下载备份。刷新页面即可载入其他页面的最新内容。");
      },
      hasUnsaved: () => edits.current !== savedEdits.current,
      /** Replace the current fields with the leftover from the last visit (the student chose to). */
      restoreLeftover: () => {
        if (!leftover) return;
        try {
          const kept = JSON.parse(leftover) as { drafts?: Partial<SessionState["drafts"]>; outline?: SessionState["outline"] };
          for (const kind of ["original", "revision"] as const) {
            const text = kept.drafts?.[kind];
            if (typeof text === "string" && text !== ref.current.drafts[kind]) edit(kind, s => ({ ...s, drafts: { ...s.drafts, [kind]: text } }));
          }
          if (kept.outline && JSON.stringify(kept.outline) !== JSON.stringify(ref.current.outline)) { const outline = kept.outline; edit("outline", s => ({ ...s, outline })); }
        } catch { /* unreadable: nothing to restore */ }
        writeLocalDraft(essayLeftoverKey(ref.current.id), ""); setLeftover(null);
      },
      discardLeftover: () => { writeLocalDraft(essayLeftoverKey(ref.current.id), ""); setLeftover(null); },
      clearError: () => setError(null),
    },
  };
}
type SessionContextValue = ReturnType<typeof useSessionController> & { questionBankEnabled: boolean; tutorV2Enabled: boolean };
const SessionContext = createContext<SessionContextValue | null>(null);
export function SessionProvider({ initialState, children, tutorV2Enabled = false, questionBankEnabled = false }: { initialState: SessionState; children: ReactNode; tutorV2Enabled?: boolean; questionBankEnabled?: boolean }) { const value = useSessionController(initialState); return <SessionContext.Provider value={{ ...value, questionBankEnabled, tutorV2Enabled }}>{children}</SessionContext.Provider>; }
export function useSession() { const value = useContext(SessionContext); if (!value) throw new Error("useSession must be used inside SessionProvider"); return value; }
