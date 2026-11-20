"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Check, ChevronDown, Copy, Pause, Play, RotateCcw, Search } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { MotionButton, MotionProvider, motionTokens } from "@/components/motion";
import { Input } from "@/components/ui/input";
import { catalog, groups, type DemoSpec, type Group } from "./catalog";
import { ActionsDemo, IconsDemo, LoadingDemo, NoticeDemo, SkeletonDemo } from "./demos/feedback";
import { DialogDemo, DisclosureDemo, DrawerDemo, MenusDemo, SidebarDemo, TabsDemo } from "./demos/navigation";
import { ChatDemo, CompareDemo, HighlightDemo, SelectionDemo, SuggestionDemo } from "./demos/writing";
import { CompletionDemo, FormsDemo, ListDemo, ScoresDemo, StepsDemo, TopicDemo } from "./demos/practice";
import { ThemeCompareDemo } from "./demos/theme-compare";
import { DevinDemo } from "./demos/devin";
import { CollageDemo } from "./demos/collage";
import s from "./preview.module.css";

const demos = {
  themes: ThemeCompareDemo, devin: DevinDemo, collage: CollageDemo,
  loading: LoadingDemo, actions: ActionsDemo, icons: IconsDemo, notices: NoticeDemo, skeleton: SkeletonDemo,
  tabs: TabsDemo, sidebar: SidebarDemo, disclosure: DisclosureDemo, dialog: DialogDemo, drawer: DrawerDemo, menus: MenusDemo,
  chat: ChatDemo, selection: SelectionDemo, suggestion: SuggestionDemo, highlight: HighlightDemo, compare: CompareDemo,
  list: ListDemo, scores: ScoresDemo, steps: StepsDemo, topic: TopicDemo, forms: FormsDemo, completion: CompletionDemo,
};

function PreviewCard({ spec, index, epoch }: { spec: DemoSpec; index: number; epoch: number }) {
  const [replay, setReplay] = useState(0);
  const [copied, setCopied] = useState("");
  const Demo = demos[spec.id as keyof typeof demos];
  const code = `// 在已启用 MotionProvider 的客户端区域使用\n${spec.code}`;
  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopied("已复制"); }
    catch { setCopied("复制不可用，请直接选择下方代码。"); }
  }
  return <article className={`${s.panel} ${(["collage", "devin", "themes"].includes(spec.id)) ? s.widePanel : ""}`} id={`demo-${spec.id}`} aria-labelledby={`title-${spec.id}`}>
    <header className={s.panelHeader}><span className={s.number}>{String(index + 1).padStart(2, "0")}</span><div><h3 id={`title-${spec.id}`}>{spec.title}</h3><p>{spec.description}</p></div><MotionButton variant="ghost" size="icon-xs" aria-label={`重播${spec.title}`} onClick={() => setReplay(n => n + 1)}><RotateCcw size={13} /></MotionButton></header>
    <div className={(["collage", "devin", "themes"].includes(spec.id)) ? s.wideDemo : s.demo}><Demo key={`${epoch}-${replay}`} /></div>
    <details className={s.handoff}><summary><span>接入说明</span><ChevronDown size={13} /></summary><div className={s.handoffBody}><p className={s.recipe}>{spec.primitive}</p><p>{spec.integration}</p><ul>{spec.targets.map(target => <li key={target}><code>{target}</code></li>)}</ul><div className={s.codeTop}><span>用法片段</span><MotionButton variant="ghost" size="xs" onClick={copy}>{copied === "已复制" ? <Check size={12} /> : <Copy size={12} />}复制代码</MotionButton></div><pre><code>{code}</code></pre><p className={s.hint} role="status">{copied || "由 components/motion 导出；片段中的状态与回调由业务组件提供。"}</p></div></details>
  </article>;
}

export function MotionPreview() {
  const [category, setCategory] = useState<Group | "all">("all");
  const [query, setQuery] = useState("");
  const [slow, setSlow] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [paused, setPaused] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const systemReduced = useReducedMotion();
  const visible = catalog.filter(item => (category === "all" || category === item.group) && `${item.title} ${item.description} ${item.targets.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <MotionProvider reduced={reduced} slow={slow} paused={paused}>
    <div className={s.page}><nav className={s.nav} aria-label="动效预览导航"><Link href="/" className={s.wordmark}>Aug<em>Write</em></Link><span className={s.navDivider}>/</span><span>交互预览</span><Link href="/" className={s.back}><ArrowLeft size={14} />返回网站</Link></nav>
      <main className={s.main}><header className={s.hero}><div><div className={s.eyebrow}><span />与当前前端对齐 · 预览版 05</div><h1 className="page-heading">让每个动作，都恰到好处。</h1><p>沿用桌面、面板与纸张的层次，把灵动留给真正发生变化的地方。</p></div><div className={s.summary}><strong>{catalog.length}</strong><span>组可交互场景<br />一套统一动效</span></div></header>
        <div className={s.principles}><span><Check size={13} />颜色与控件沿用现有前端</span><span><Check size={13} />短距离、无夸张回弹</span><span><Check size={13} />键盘与减少动态效果</span><details><summary>查看节奏规范<ChevronDown size={12} /></summary><div><p>按压 {motionTokens.fast * 1000}ms · 状态 {motionTokens.standard * 1000}ms · 布局 {motionTokens.layout * 1000}ms</p><p>进入位移 {motionTokens.distance}px；单次图标与进度 {motionTokens.reveal * 1000}ms；循环 {motionTokens.loop}s。</p><p>不对正文打字、倒计时、历史消息和整页导航添加持续动画。</p></div></details></div>
        <div className={s.controls}><div className={s.filterRow}><div className={s.filters} role="group" aria-label="预览分类"><button type="button" aria-pressed={category === "all"} onClick={() => setCategory("all")}>全部<span>{catalog.length}</span></button>{groups.map(group => <button type="button" key={group.id} aria-pressed={category === group.id} onClick={() => setCategory(group.id)}>{group.label}<span>{catalog.filter(item => item.group === group.id).length}</span></button>)}</div><div className={s.search}><Search size={14} /><Input aria-label="搜索动效场景" placeholder="搜索场景或组件" value={query} onChange={e => setQuery(e.target.value)} /></div></div>
          <div className={s.playback}><div className={s.actions}><span className={s.controlLabel}>播放</span><MotionButton size="xs" variant={slow ? "outline" : "secondary"} aria-pressed={!slow} onClick={() => setSlow(false)}>正常</MotionButton><MotionButton size="xs" variant={slow ? "secondary" : "ghost"} aria-pressed={slow} onClick={() => setSlow(true)}>0.5× 慢放</MotionButton><MotionButton size="xs" variant="ghost" aria-pressed={paused} disabled={reduced || !!systemReduced} onClick={() => setPaused(!paused)}>{paused ? <Play size={12} /> : <Pause size={12} />}{paused ? "继续循环" : "暂停循环"}</MotionButton></div><div className={s.actions}><label className={s.checkboxLabel}><input type="checkbox" checked={reduced || !!systemReduced} disabled={!!systemReduced} onChange={e => setReduced(e.target.checked)} />{systemReduced ? "跟随系统减少动态" : "减少动态效果"}</label><MotionButton size="xs" variant="ghost" onClick={() => setEpoch(n => n + 1)}><RotateCcw size={12} />重置全部演示</MotionButton></div></div>
        </div>
        <p className={s.resultCount} role="status">显示 {visible.length} / {catalog.length} 组场景 · 操作仅影响演示数据</p>
        {groups.map(group => { const items = visible.filter(item => item.group === group.id); return items.length ? <section key={group.id} className={s.group} aria-labelledby={`group-${group.id}`}><div className={s.groupHeader}><h2 id={`group-${group.id}`}>{group.label}</h2><p>{group.description}</p><span>{items.length} 组</span></div><div className={s.grid}>{items.map(item => <PreviewCard key={item.id} spec={item} index={catalog.indexOf(item)} epoch={epoch} />)}</div></section> : null; })}
        {!visible.length && <div className={s.noResults}><Search size={23} /><h2>没有找到这个场景</h2><p>试试「保存」「教练」「表单」，或清除筛选。</p><MotionButton variant="outline" size="sm" onClick={() => { setQuery(""); setCategory("all"); }}>显示全部场景</MotionButton></div>}
        <footer className={s.pageFooter}><span>动效服务于状态变化，让阅读与思考保持安静。</span><span>仅供预览 · 尚未接入业务页面</span></footer>
      </main>
    </div>
  </MotionProvider>;
}
