"use client";

import { useState } from "react";
import { ArrowRight, Check, Pause, Play, RotateCcw } from "lucide-react";
import { MotionButton, MotionCollage, useMotionSettings } from "@/components/motion";
import s from "./collage.module.css";

/** Original, fictional study materials; all colors inherit the site's theme. */
function StudyMaterial({ kind }: { kind: number }) {
  switch (kind) {
    case 0: return <div className={s.fragment}><small>WRITING · 01</small><h4>A space to think.</h4><p>Learning begins with a question. A good example brings an idea to life.</p><div className={s.rules} /><span className={s.annotation}>让例子更具体 ↗</span></div>;
    case 1: return <div className={`${s.fragment} ${s.note}`}><small>教练批注</small><span className={s.quoteMark}>“</span><p>你已经说清楚了观点。<br />试着再往前走一步：<br /><mark>为什么会这样？</mark></p><span className={s.signature}>project 0 · coach</span></div>;
    case 2: return <div className={s.fragment}><small>表达卡片 · 012</small><h4>make a difference</h4><p>带来改变，产生影响</p><hr /><p className={s.serif}>Small steps can make<br />a meaningful difference.</p></div>;
    case 3: return <div className={s.fragment}><small>OUTLINE</small><h4>从观点到论证</h4><div className={s.outline}><span>01 明确立场</span><span>02 解释原因</span><span>03 举一个例子</span></div></div>;
    case 4: return <div className={s.fragment}><small>REVISION · 02</small><h4>Be more specific.</h4><p className={s.serif}><del>Technology is good.</del><br /><mark>Interactive lessons</mark><br />help ideas come alive.</p><span className={s.annotation}>清楚，比复杂更好。</span></div>;
    case 5: return <div className={`${s.fragment} ${s.progress}`}><small>本周练习</small><h4>一步一步，写得更好。</h4><div className={s.week}>{[0,1,2,3,4].map(i => <span key={i} data-done={i < 3}>{i < 3 ? <Check size={12} /> : "·"}</span>)}</div><p>三次练习，三个新发现。</p></div>;
    case 6: return <div className={s.fragment}><small>TOPIC · 城市与生活</small><svg viewBox="0 0 180 82" fill="none"><path d="M0 75H180M14 75V37H43V75M22 45H35M22 55H35M57 75V15H94V75M66 27H85M66 39H85M66 51H85M109 75V44H139V75M147 75V27H172V75" stroke="currentColor" strokeWidth="1.3" /><circle cx="132" cy="19" r="10" fill="currentColor" opacity=".12" /></svg><h4>A city for everyone.</h4><p>让生活中的观察成为论据。</p></div>;
    default: return <div className={`${s.fragment} ${s.note}`}><small>值得记住的一句</small><h4>Ideas grow<br />when you write.</h4><div className={s.rules} /><p>把一个念头，写成一个观点。</p></div>;
  }
}
const materials = Array.from({ length: 8 }, (_, i) => <StudyMaterial key={i} kind={i} />);
const defaults = { speed: 1, density: 20, blur: 4 };

export function CollageDemo() {
  const [speed, setSpeed] = useState(defaults.speed);
  const [density, setDensity] = useState(defaults.density);
  const [blur, setBlur] = useState(defaults.blur);
  const [paused, setPaused] = useState(false);
  const [backgroundOnly, setBackgroundOnly] = useState(false);
  const { reduced, paused: globalPaused, slow } = useMotionSettings();
  const stopped = paused || reduced || globalPaused;
  const config = `<MotionCollage items={studyMaterials} speed={${speed}} density={${density}} blur={${blur}} />`;
  const [copyState, setCopyState] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  async function copy() {
    setShowConfig(true);
    setCopyState("配置已在下方展开，也可以直接选择复制。");
    try { await navigator.clipboard.writeText(config); setCopyState("已复制当前参数"); }
    catch { setCopyState("请直接选择下方的当前参数复制"); }
  }
  return <div className={s.experiment}>
    <div className={s.stage} data-background-only={backgroundOnly}>
      <MotionCollage items={materials} speed={speed} density={density} blur={blur} paused={paused} />
      {!backgroundOnly && <div className={s.foreground}>
        <div className={s.intro}><span>project <em>0</em></span><h4>给想法一点空间。</h4><p>从一句话开始，慢慢写清楚。</p></div>
        <div className={s.paper}><div className={s.paperTop}><span>写作练习 / 教育与成长</span><span><Check size={11} />已保存</span></div><h5>Every idea begins<br />with a first draft.</h5><p>Good writing is not about finding complicated words. It is about making your thinking clear.</p><div className={s.coach}><span>0</span><div><strong>从你熟悉的例子开始。</strong><p>想一想，哪次课堂经历改变了你的看法？</p></div><ArrowRight size={14} /></div><div className={s.paperBottom}><span>Task 2 · 论证练习</span><span>让思考落在纸上</span></div></div>
      </div>}
      <div className={s.stageFooter}><span><i data-paused={stopped} />{reduced ? "已减少动态 · 静态构图" : globalPaused ? "已跟随全局暂停" : paused ? "画面已暂停" : "向右漂移 · 双层景深"}</span><span>素材均为虚构示例</span></div>
    </div>
    <div className={s.tuning}>
      <div className={s.sliders}>
        <label><span>移动速度<output>{speed.toFixed(2).replace(/0$/, "")}×</output></span><input aria-label="背景移动速度" aria-valuetext={`${speed} 倍`} type="range" min="0.25" max="3" step="0.25" value={speed} onChange={e => { setSpeed(Number(e.target.value)); setCopyState(""); }} /><small>缓慢漂移 — 更明显的流动</small></label>
        <label><span>素材密度<output>{density} 张</output></span><input aria-label="背景素材密度" aria-valuetext={`${density} 张`} type="range" min="8" max="32" step="2" value={density} onChange={e => { setDensity(Number(e.target.value)); setCopyState(""); }} /><small>更多留白 — 更丰富的拼贴</small></label>
        <label><span>远景模糊<output>{blur} px</output></span><input aria-label="背景远景模糊度" aria-valuetext={`${blur} 像素`} type="range" min="0" max="10" step="0.5" value={blur} onChange={e => { setBlur(Number(e.target.value)); setCopyState(""); }} /><small>清晰细节 — 柔和景深</small></label>
      </div>
      <div className={s.toolbar}><div><MotionButton size="sm" variant="outline" disabled={reduced || globalPaused} onClick={() => setPaused(!paused)}>{paused ? <Play size={13} /> : <Pause size={13} />}{paused ? "播放背景" : "暂停背景"}</MotionButton><MotionButton size="sm" variant="ghost" aria-pressed={backgroundOnly} onClick={() => setBackgroundOnly(!backgroundOnly)}>{backgroundOnly ? "显示前景" : "只看背景"}</MotionButton></div><div><MotionButton size="sm" variant="ghost" onClick={() => { setSpeed(defaults.speed); setDensity(defaults.density); setBlur(defaults.blur); setPaused(false); setBackgroundOnly(false); setCopyState(""); setShowConfig(false); }}><RotateCcw size={13} />恢复推荐</MotionButton><MotionButton size="sm" variant="outline" onClick={copy}>复制当前配置</MotionButton></div></div>
      <p className={s.status} role="status">{copyState || (reduced ? "减少动态效果优先：参数仍可调整，背景保持静止。" : globalPaused ? "当前已全局暂停，可在页面上方继续循环。" : `当前播放速度 ${(speed * (slow ? .5 : 1)).toFixed(2)}×${slow ? "（含全局慢放）" : ""} · 暂停可查看构图；滚出视野后自动暂停。`)}</p>
      <details className={s.config} open={showConfig} onToggle={e => setShowConfig(e.currentTarget.open)}><summary>当前参数</summary><code>{config}</code></details>
    </div>
  </div>;
}
