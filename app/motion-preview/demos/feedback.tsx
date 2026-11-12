"use client";

import { useRef, useState } from "react";
import { Bell, Bookmark, Copy, FileText, RotateCcw, Save } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { MotionAction, MotionButton, MotionCheck, MotionIconButton, MotionLoader, MotionNotice, MotionReveal, MotionSkeleton, MotionSwap, type LoaderKind } from "@/components/motion";
import { useDemoJob } from "./shared";
import s from "../preview.module.css";

export function LoadingDemo() {
  const [kind, setKind] = useState<LoaderKind>("bloom");
  return <div className={s.stack}>
    <div className={s.choices} role="group" aria-label="加载符号">{([['bloom','花瓣'],['dots','三点'],['orbit','圆环']] as const).map(([value,label]) => <MotionButton key={value} variant={kind === value ? "secondary" : "ghost"} size="sm" aria-pressed={kind === value} onClick={() => setKind(value)}>{label}</MotionButton>)}</div>
    <div className={s.coachBox}><div className={s.coachLabel}><span>0</span>教练</div><p>我正在看看你的论证。</p><span className={s.thinking}><MotionLoader kind={kind} size={22} label="教练正在思考" />正在整理思路</span></div>
    <div className={s.splitLine}><span>按钮中的实际尺寸</span><MotionButton size="sm" disabled><MotionLoader kind={kind} size={15} label="" />评估中</MotionButton></div>
  </div>;
}

export function ActionsDemo() {
  const { status, run } = useDemoJob();
  return <div className={s.stack}>
    <div className={s.miniPaper}><div className={s.paperLabel}><FileText size={15} />Task 2 · 当前草稿</div><p className={s.essay}>Small changes can make<br />a meaningful difference.</p></div>
    <div className={s.actions}><MotionAction status={status} onClick={() => run()} className={s.stableButton} successLabel="已保存 · 再体验" errorLabel="重新保存"><Save size={15} />保存草稿</MotionAction><MotionButton variant="ghost" size="sm" disabled={status === "pending"} onClick={() => run("error")}>模拟失败</MotionButton></div>
    <div className={s.statusLine} role="status"><MotionSwap value={status}>{status === "error" ? <span className={s.error}>保存失败，草稿仍然保留。可以重试。</span> : status === "pending" ? "正在保存，请稍等…" : status === "success" ? <span className={s.good}>已保存。完成后按钮宽度保持稳定。</span> : "按钮与顶部自动保存状态共用同一套反馈。"}</MotionSwap></div>
  </div>;
}

export function IconsDemo() {
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("移入、聚焦或点击图标，观察细微反馈。");
  return <div className={s.stack}>
    <div className={s.iconRow}>
      <div><MotionIconButton label="收藏示例" selected={saved} onClick={() => { setSaved(!saved); setMessage(saved ? "已取消收藏。" : "已收藏示例。"); }}><Bookmark size={18} fill={saved ? "currentColor" : "none"} /></MotionIconButton><small>收藏</small></div>
      <div><MotionIconButton label="提醒示例" kind="ring" onClick={() => setMessage("提醒反馈已播放。")}><Bell size={18} /></MotionIconButton><small>提醒</small></div>
      <div><MotionIconButton label="刷新示例" kind="turn" onClick={() => setMessage("刷新反馈已播放。")}><RotateCcw size={18} /></MotionIconButton><small>刷新</small></div>
      <div><MotionIconButton label="复制成功反馈" onClick={() => setMessage("复制成功反馈已播放（演示）。")}><Copy size={18} /></MotionIconButton><small>复制</small></div>
    </div><div className={s.inset}><span className={s.paperLabel}>编辑器工具栏</span><p>沿用 Lucide 线条与现有按钮尺寸。只在交互时回应。</p></div><p className={s.statusLine} role="status">{message}</p>
  </div>;
}

export function NoticeDemo() {
  const [notice, setNotice] = useState<"good" | "warn" | null>(null);
  const [event, setEvent] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return <div className={s.stack}><div className={s.actions}><MotionButton variant="outline" size="sm" onClick={e => { triggerRef.current = e.currentTarget; setNotice("good"); setEvent(n => n + 1); }}>成功提示</MotionButton><MotionButton variant="outline" size="sm" onClick={e => { triggerRef.current = e.currentTarget; setNotice("warn"); setEvent(n => n + 1); }}>连接提示</MotionButton></div>
    <div className={s.noticeStage}><AnimatePresence initial={false}>{notice ? <MotionNotice key={`${notice}-${event}`} tone={notice} onDismiss={() => { setNotice(null); triggerRef.current?.focus(); }}>{notice === "good" ? "练习已保存，可以安心离开。" : "连接暂时中断，内容仍在这里。"}</MotionNotice> : <p className={s.hint}>提示会在这里出现，点击关闭后轻柔退出。</p>}</AnimatePresence></div>
    <p className={s.hint}>重要提示保留到你关闭，不用追着消失的文字读。</p></div>;
}

export function SkeletonDemo() {
  const { status, run } = useDemoJob(1300);
  return <div className={s.stack}><div className={s.splitLine}><span>最近一次练习</span><MotionButton size="sm" variant="outline" disabled={status === "pending"} onClick={() => run()}><RotateCcw size={14} />重新读取</MotionButton></div>
    <div className={s.skeletonStage} aria-busy={status === "pending"}><MotionSwap value={status === "pending" ? "loading" : "content"}>{status === "pending" ? <MotionSkeleton lines={4} /> : <MotionReveal><div className={s.paperLabel}><FileText size={16} />教育与科技</div><h4 className={s.cardTitle}>Technology in the classroom</h4><p className={s.muted}>观点明确，下一步试着补充一个具体例子。</p><span className={s.savedLine}><MotionCheck size={14} />反馈已就绪</span></MotionReveal>}</MotionSwap></div><p className={s.hint}>内容保留空间，加载完成时只淡入一次。</p></div>;
}
