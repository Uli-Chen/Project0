"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode, type RefObject } from "react";
import { useIsWide } from "@/hooks/use-wide";
import { availablePanels, defaultPanel, defaultVersion, type Panel } from "@/lib/learning/essay-view";
import { useSession } from "@/lib/prototype/session-store";
import type { EssayKind } from "@/lib/prototype/types";

export type Intent = "ask" | "attempt" | "express";

/**
 * 作文页的界面状态（不保存到服务器）：右侧面板、正在看的版本、教练输入的上下文、两侧栏开合。
 * 阶段变化时重置为该阶段的默认值。
 */
function useEssayUiState({ centerRef }: { centerRef: RefObject<HTMLDivElement | null> }) {
  const { state } = useSession();
  const wide = useIsWide();
  const [panel, setPanelState] = useState<Panel | null>(() => defaultPanel(state));
  const [version, setVersion] = useState<EssayKind>(() => defaultVersion(state));
  const [quote, setQuote] = useState<string | null>(null);
  const [issueContext, setIssueContext] = useState<number | null>(() => state.stage === "revising" ? state.activeIssue : null);
  const [intent, setIntent] = useState<Intent>("ask");
  const [hoverRank, setHoverRank] = useState<number | null>(null);
  const [compareMode, setCompareMode] = useState<"diff" | "marks">("diff");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [sheet, setSheet] = useState<"left" | "right" | null>(null);
  const focusTick = useRef(0);
  const [focusKey, setFocusKey] = useState(0);

  const stage = state.stage;
  const [lastStage, setLastStage] = useState(stage);
  if (lastStage !== stage) {
    setLastStage(stage);
    setPanelState(defaultPanel(state));
    setVersion(defaultVersion(state));
    setIssueContext(stage === "revising" || stage === "feedback" ? state.activeIssue : null);
    setIntent("ask");
    setQuote(null);
  }

  // 窄屏下写前和反馈的主要内容在右栏，首次进入时直接打开
  const [autoOpened, setAutoOpened] = useState(false);
  if (!autoOpened && !wide && (stage === "prewriting" || stage === "feedback")) {
    setAutoOpened(true);
    setSheet("right");
  }

  const setPanel = useCallback((next: Panel) => {
    setPanelState(next);
    if (wide) setRightOpen(true); else setSheet("right");
  }, [wide]);

  /** 选中文字点“问教练”：切到提问，带上引用，移除问题上下文 */
  const askAbout = useCallback((text: string) => {
    setQuote(text); setIssueContext(null); setIntent("ask");
    setPanel("coach");
    setFocusKey(++focusTick.current);
  }, [setPanel]);

  /** 从反馈讨论某个问题 */
  const discussIssue = useCallback((rank: number) => {
    setIssueContext(rank); setQuote(null); setIntent("ask");
    setPanel("coach");
    setFocusKey(++focusTick.current);
  }, [setPanel]);

  /** 滚动到正文中的某一句；窄屏先关掉抽屉 */
  const jumpToSentence = useCallback((id: number) => {
    if (!wide) setSheet(null);
    setTimeout(() => {
      const el = centerRef.current?.querySelector<HTMLElement>(`[data-sentence="${id}"]`);
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.animate([{ outline: "2px solid var(--foreground)" }, { outline: "2px solid transparent" }], { duration: 1200 });
    }, wide ? 0 : 320);
  }, [wide, centerRef]);

  return {
    wide, panel, panels: availablePanels(state), setPanel, version, setVersion, quote, setQuote, issueContext, setIssueContext,
    intent, setIntent, hoverRank, setHoverRank, compareMode, setCompareMode,
    leftOpen, setLeftOpen, rightOpen, setRightOpen, sheet, setSheet, focusKey,
    askAbout, discussIssue, jumpToSentence,
  };
}

type EssayUi = ReturnType<typeof useEssayUiState>;
type EssayRefs = { centerRef: RefObject<HTMLDivElement | null>; editorRef: RefObject<HTMLTextAreaElement | null> };
const EssayUiContext = createContext<EssayUi | null>(null);
const EssayRefsContext = createContext<EssayRefs | null>(null);

export function EssayUiProvider({ children }: { children: ReactNode }) {
  const centerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [refs] = useState<EssayRefs>(() => ({ centerRef, editorRef }));
  const value = useEssayUiState({ centerRef });
  return <EssayRefsContext.Provider value={refs}><EssayUiContext.Provider value={value}>{children}</EssayUiContext.Provider></EssayRefsContext.Provider>;
}

/** 正文滚动容器与编辑器；和界面状态分开，避免渲染时读到 ref */
export function useEssayRefs() {
  const value = useContext(EssayRefsContext);
  if (!value) throw new Error("useEssayRefs must be used inside EssayUiProvider");
  return value;
}

export function useEssayUi() {
  const value = useContext(EssayUiContext);
  if (!value) throw new Error("useEssayUi must be used inside EssayUiProvider");
  return value;
}
