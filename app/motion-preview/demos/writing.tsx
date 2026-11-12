"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Lightbulb, MessageSquare, Quote, Send, X } from "lucide-react";
import { MotionAction, MotionButton, MotionCollapse, MotionLoader, MotionNotice, MotionReveal, MotionSwap, MotionTabs, useMotionSettings } from "@/components/motion";
import { useDemoJob } from "./shared";
import s from "../preview.module.css";

export function ChatDemo() {
  const { status, run } = useDemoJob(1400);
  return <div className={s.stack}><div className={s.chatPreview}><p className={s.userBubble}>我的例子够具体吗？</p><div className={s.coachBox}><div className={s.coachLabel}><span>0</span>教练</div><div className={s.replySpace} aria-live="polite" aria-busy={status === "pending"}>{status === "pending" ? <MotionLoader kind="dots" size={25} label="教练正在思考" /> : status === "success" ? <MotionReveal><p>试着补充一个课堂场景：学生遇到了什么困难，老师又是怎样帮助他们的？</p><blockquote>For example, a teacher can notice when a student feels confused.</blockquote></MotionReveal> : <p className={s.muted}>点击下方，体验思考状态到回复的过渡。</p>}</div></div></div><MotionAction size="sm" variant="outline" status={status} pendingLabel="教练正在思考" successLabel="再看一次回复" onClick={() => run()}><Send size={14} />模拟教练回复</MotionAction></div>;
}

const sentence = "A teacher can notice when a student feels confused.";
export function SelectionDemo() {
  const [selected, setSelected] = useState("");
  const [quote, setQuote] = useState("");
  const text = useRef<HTMLTextAreaElement>(null);
  const quoteRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  return <div className={s.stack}><div className={s.selectionPaper}><label className={s.paperLabel} htmlFor="selection-sample">选中一句话，带给教练</label><textarea id="selection-sample" ref={text} readOnly value={sentence} className={s.selectText} onSelect={e => { const element = e.currentTarget; const value = element.value.slice(element.selectionStart, element.selectionEnd); if (value) setSelected(value); }} />
    <AnimatePresence>{selected && <MotionReveal className={s.selectionToolbar}><MotionButton size="sm" variant="secondary" onClick={() => { setQuote(selected); setSelected(""); requestAnimationFrame(() => quoteRef.current?.focus()); }}><MessageSquare size={14} />问教练</MotionButton><MotionButton size="icon-xs" variant="ghost" aria-label="清除选区预览" onClick={() => { setSelected(""); actionRef.current?.focus(); }}><X size={13} /></MotionButton></MotionReveal>}</AnimatePresence></div>
    <MotionButton ref={actionRef} size="sm" variant="outline" onClick={() => { text.current?.focus(); text.current?.select(); setSelected(sentence); }}>选择示例句</MotionButton>
    <div ref={quoteRef} tabIndex={-1} className={s.quoteFocus} aria-label="教练引用区"><MotionCollapse open={!!quote} id="quote-demo"><div className={s.quote}><Quote size={14} /><span>{quote}</span><MotionButton size="icon-xs" variant="ghost" aria-label="移除引用" onClick={() => { setQuote(""); actionRef.current?.focus(); }}><X size={13} /></MotionButton></div></MotionCollapse></div>
  </div>;
}

export function SuggestionDemo() {
  const [status, setStatus] = useState<"pending" | "accepted" | "dismissed">("pending");
  const acceptRef = useRef<HTMLButtonElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  function update(next: typeof status) {
    setStatus(next);
    requestAnimationFrame(() => (next === "pending" ? acceptRef : undoRef).current?.focus());
  }
  return <div className={s.stack}><div className={s.suggestion}><span className={s.coachLabel}><Lightbulb size={14} />表达建议</span><p className={s.essay}>Teachers offer guidance<br />that technology cannot replace.</p><p className={s.muted}>把「帮助学生」具体化为「提供指导」。</p><div className={s.suggestionActions}><MotionSwap value={status}>{status === "pending" ? <div className={s.actions}><MotionButton size="sm" variant="outline" ref={acceptRef} onClick={() => update("accepted")}>采用建议</MotionButton><MotionButton size="sm" variant="ghost" onClick={() => update("dismissed")}>忽略</MotionButton></div> : <div className={s.splitLine}><span className={status === "accepted" ? s.good : s.muted}>{status === "accepted" && <Check size={14} />}{status === "accepted" ? "已采用" : "已忽略"}</span><MotionButton size="sm" variant="ghost" ref={undoRef} onClick={() => update("pending")}>撤销操作</MotionButton></div>}</MotionSwap></div></div><p className={s.statusLine} role="status">{status === "pending" ? "选择后保留上下文，并提供撤销。" : status === "accepted" ? "建议已采用（演示）。" : "建议已忽略（演示）。"}</p></div>;
}

export function HighlightDemo() {
  const [active, setActive] = useState(0);
  const { transition } = useMotionSettings();
  return <div className={s.stack}><div className={s.miniPaper}><p className={s.essay}>Technology is useful. <motion.mark animate={{ backgroundColor: active === 1 ? "var(--hl-1)" : "rgba(0,0,0,0)" }} transition={transition("layout")}>It helps students learn better.</motion.mark> <motion.mark animate={{ backgroundColor: active === 2 ? "var(--hl-2)" : "rgba(0,0,0,0)" }} transition={transition("layout")}>This is a good thing.</motion.mark></p></div><div className={s.issueChoices}><MotionButton size="sm" variant="outline" aria-pressed={active === 1} onClick={() => setActive(active === 1 ? 0 : 1)}><span className={s.issueBadge}>1</span>例子不够具体</MotionButton><MotionButton size="sm" variant="outline" aria-pressed={active === 2} onClick={() => setActive(active === 2 ? 0 : 2)}><span className={s.issueBadge} data-rank="2">2</span>指代不够明确</MotionButton></div><div className={s.statusLine} role="status">{active === 1 ? "对应句子已标出：补充一个具体的学习场景。" : active === 2 ? "对应句子已标出：说明 This 具体指什么。" : "点击问题，原文中的对应句子柔和显色。"}</div></div>;
}

export function CompareDemo() {
  const [version, setVersion] = useState("original");
  return <div className={s.stack}><MotionTabs label="作文版本预览" value={version} onChange={setVersion} items={[
    { value: "original", label: "原稿", content: <div className={s.miniPaper}><p className={s.essay}>Technology is good for students. It can help them learn many things.</p></div> },
    { value: "revision", label: "改写稿", content: <div className={s.miniPaper}><p className={s.essay}>Interactive lessons help students explore difficult ideas at their own pace.</p></div> },
    { value: "diff", label: "查看差异", content: <div className={s.miniPaper}><p className={s.essay}><del className={s.deleted}>Technology is good.</del> <ins className={s.inserted}>Interactive lessons make difficult ideas easier to explore.</ins></p></div> },
  ]} /><MotionNotice>切换版本时保留阅读位置与纸面尺寸。</MotionNotice></div>;
}
