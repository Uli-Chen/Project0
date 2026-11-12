"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, FileText, Plus, RotateCcw, Search, X } from "lucide-react";
import { MotionButton, MotionCollapse, MotionList, MotionListItem, MotionMeter, MotionReveal, MotionStep, MotionSwap, useMotionSettings } from "@/components/motion";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Segmented } from "@/components/ui/segmented";
import s from "../preview.module.css";

const initialRows = [{ id: 1, title: "课堂中的科技", state: "已完成" }, { id: 2, title: "城市与公共交通", state: "草稿" }, { id: 3, title: "教育与个人成长", state: "已完成" }];
export function ListDemo() {
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState("");
  const [onlyDone, setOnlyDone] = useState(false);
  const id = useRef(4);
  const addButton = useRef<HTMLButtonElement>(null);
  const visible = rows.filter(row => row.title.includes(query) && (!onlyDone || row.state === "已完成"));
  return <div className={s.stack}><div className={s.searchRow}><Search size={15} /><Input aria-label="搜索示例作文" placeholder="搜索作文，试试「教育」" value={query} onChange={e => setQuery(e.target.value)} /><MotionButton ref={addButton} size="icon-sm" variant="outline" aria-label="添加示例作文" disabled={rows.length >= 5} onClick={() => { setRows([...rows, { id: id.current++, title: "新的写作练习", state: "草稿" }]); setQuery(""); setOnlyDone(false); }}><Plus size={15} /></MotionButton></div><label className={s.checkboxLabel}><input type="checkbox" checked={onlyDone} onChange={e => setOnlyDone(e.target.checked)} />仅看已完成</label>
    <div className={s.listStage}><MotionList>{visible.map(row => <MotionListItem key={row.id}><div className={s.essayRow}><FileText size={15} /><span>{row.title}<small>{row.state}</small></span><MotionButton size="icon-xs" variant="ghost" aria-label={`移除${row.title}`} onClick={() => { setRows(rows.filter(r => r.id !== row.id)); addButton.current?.focus(); }}><X size={13} /></MotionButton></div></MotionListItem>)}</MotionList>{!visible.length && <MotionReveal className={s.empty}><FileText size={22} /><p>没有符合条件的练习</p><MotionButton size="xs" variant="ghost" onClick={() => { setQuery(""); setOnlyDone(false); setRows(initialRows); }}>恢复示例</MotionButton></MotionReveal>}</div><p className={s.hint} role="status">{visible.length} 篇示例 · 可筛选、添加和移除</p></div>;
}

export function ScoresDemo() {
  const [revision, setRevision] = useState(false);
  const scores = revision ? [7, 7, 6.5, 7] : [6.5, 6.5, 6, 6.5];
  return <div className={s.stack}><div className={s.splitLine}><div><span className={s.paperLabel}>{revision ? "改写稿" : "原稿"} · 预估分数</span><MotionSwap value={revision ? 7 : 6.5} className={s.score}>{revision ? "7.0" : "6.5"}</MotionSwap></div><MotionButton size="sm" variant="outline" onClick={() => setRevision(!revision)}>{revision ? "查看原稿" : "查看改写后"}</MotionButton></div><dl className={s.scoreRows}>{["任务回应", "连贯与衔接", "词汇", "语法"].map((label, i) => <div key={label}><dt>{label}</dt><dd><MotionMeter label={label} max={9} value={scores[i]} tone={i === 2 ? "warn" : "muted"} /></dd><dd>{scores[i].toFixed(1)}</dd></div>)}</dl><p className={s.hint}>演示分数，非真实评估。数值直接呈现，条形平滑更新。</p></div>;
}

export function StepsDemo() {
  const [step, setStep] = useState(0);
  return <div className={s.stack}><div className={s.steps}>{["评分与诊断", "整理反馈", "完成"].map((label, i) => <MotionStep key={label} done={step > i || step === 2} active={step === i && step < 2}>{label}</MotionStep>)}</div><MotionMeter label="评估阶段演示" max={2} value={step} tone={step === 2 ? "good" : "primary"} /><div className={s.inset}><MotionSwap value={step}><h4>{["正在读你的作文", "把发现整理成建议", "反馈准备好了"][step]}</h4><p>{["先理解你的立场与论证。", "找出最值得先解决的一个问题。", "可以开始查看反馈和改写方向。"][step]}</p></MotionSwap></div><MotionButton variant="outline" size="sm" onClick={() => setStep((step + 1) % 3)}>{step === 2 ? <RotateCcw size={14} /> : <ArrowRight size={14} />}{step === 2 ? "重播流程" : "模拟下一阶段"}</MotionButton><p className={s.hint}>只跟随真实阶段更新，不伪造网络完成百分比。</p></div>;
}

export function TopicDemo() {
  const [active, setActive] = useState("教育");
  const { transition, reduced } = useMotionSettings();
  return <div className={s.stack}><div className={s.topicGrid}>{["教育", "科技"].map((title, i) => <motion.button type="button" key={title} className={s.topic} aria-pressed={active === title} onClick={() => setActive(title)} initial="rest" whileHover="hover" whileFocus="hover" animate="rest"><span className={s.topicNumber}>0{i + 1}</span><strong>{title}</strong><span>{i ? "技术与生活" : "课堂与成长"}</span><motion.span className={s.topicArrow} variants={{ rest: { x: 0 }, hover: { x: reduced ? 0 : 3 } }} transition={transition()}><ArrowRight size={16} /></motion.span></motion.button>)}</div><div className={s.inset}><MotionSwap value={active}><h4>继续练习 · {active}</h4><p>{active === "教育" ? "用课堂经历，让抽象观点更具体。" : "从日常使用的技术中，找一个有说服力的例子。"}</p></MotionSwap></div><p className={s.hint}>边框和箭头回应，整张卡片保持稳定。</p></div>;
}

export function FormsDemo() {
  const [mode, setMode] = useState<"practice" | "mock">("practice");
  const [nudges, setNudges] = useState(true);
  const [name, setName] = useState("");
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return <form className={s.stack} noValidate onSubmit={e => { e.preventDefault(); if (!name.trim()) { setError(true); setSuccess(false); input.current?.focus(); } else { setError(false); setSuccess(true); } }}><Segmented ariaLabel="练习模式演示" size="sm" options={[{ value: "practice", label: "辅导练习" }, { value: "mock", label: "独立完成" }]} value={mode} onChange={setMode} /><div className={s.splitLine}><label htmlFor="demo-nudges">主动提醒</label><Switch id="demo-nudges" aria-label="主动提醒" checked={nudges} onCheckedChange={setNudges} /></div><div><label className={s.fieldLabel} htmlFor="demo-name">练习名称</label><Input id="demo-name" ref={input} placeholder="给这次练习起个名字" value={name} aria-invalid={error} aria-describedby={error ? "demo-name-error" : undefined} onChange={e => { setName(e.target.value); if (error) setError(false); setSuccess(false); }} /><MotionCollapse open={error} id="demo-name-error"><p className={s.fieldError} role={error ? "alert" : undefined}>请填写练习名称。</p></MotionCollapse></div><MotionButton type="submit" size="sm" variant="outline">验证表单</MotionButton><div className={s.statusLine} role="status">{success ? `「${name}」已就绪（演示）。` : "试试空白提交，再填入名称。错误提示展开，焦点回到输入框。"}</div></form>;
}

export function CompletionDemo() {
  const [done, setDone] = useState(false);
  const { transition, reduced } = useMotionSettings();
  return <div className={s.stack}><div className={s.splitLine}><span>本周练习</span><span className={s.muted}>{done ? 4 : 3} / 5 天</span></div><div className={s.week}>{["一", "二", "三", "四", "五", "六", "日"].map((day, i) => <div key={day}><motion.span className={s.day} animate={{ backgroundColor: i < 3 || (i === 3 && done) ? "var(--primary)" : "var(--sunk)" }} transition={transition()}>{(i < 3 || (i === 3 && done)) && <Check size={13} />}</motion.span><small>{day}</small></div>)}</div><AnimatePresence initial={false}>{done && <MotionReveal><div className={s.completion}><h4>本篇小结</h4><p>例子更具体了，论点和解释之间也有了连接。</p><p>下一步 · 在新题目中再试一次。</p></div></MotionReveal>}</AnimatePresence><motion.div initial={false} animate={{ y: 0 }} transition={transition("layout")} layout={reduced ? false : "position"}><MotionButton variant="outline" size="sm" onClick={() => setDone(!done)}>{done ? <RotateCcw size={14} /> : <Check size={14} />}{done ? "重置完成状态" : "完成今日练习"}</MotionButton></motion.div><p className={s.hint}>安静记录一次进步，结果出现一次后保持可读。</p></div>;
}
