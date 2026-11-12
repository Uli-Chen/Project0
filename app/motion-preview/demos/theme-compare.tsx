"use client";

import { useRef, useState, type CSSProperties } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { MotionButton, useMotionSettings } from "@/components/motion";
import { useDevinMotion } from "./use-devin-motion";
import { DevinLayers, devinSlots, devinImages } from "./devin-layers";
import packs from "./theme-assets.json";
import extraAssets from "./mixed-extra-assets.json";
import mixedSlots from "./mixed-slots.json";
import base from "./devin.module.css";
import s from "./theme-compare.module.css";

// Slot names, geometry, delays and speeds are shared with the unmodified reference.
const slotNames = ["horizontal-01", "horizontal-02", "horizontal-03", "horizontal-04", "horizontal-05", "horizontal-06", "horizontal-07", "square-02", "square-03", "square-04", "vertical-01", "vertical-02", "vertical-03", "vertical-04", "vertical-05", "vertical-06", "vertical-07", "vertical-08"];
const artNames = [
  ["open-pages", "library-atrium", "sculpture-study", "rotunda", "reading-table", "quiet-facade", "library-atrium", "marble-figures", "rotunda", "open-pages", "museum-light", "white-library", "marble-figures", "spiral-gallery", "quiet-facade", "museum-light", "sculpture-study", "white-library"],
  ["wind-energy", "radio-telescope", "antenna-structure", "structural-grid", "cloud-reflection", "glass-rhythm", "wind-energy", "reflective-grid", "radio-telescope", "silver-fins", "cloud-reflection", "blue-facade", "glass-rhythm", "silver-fins", "antenna-structure", "structural-grid", "reflective-grid", "radio-telescope"],
];
const mappings = packs.map((pack, p) => Object.fromEntries(slotNames.map((slot, i) => [slot, pack.assets.find(a => a.id === artNames[p][i])!])));
// Keep artwork independent of motion: only the URL array changes.
const allAssets = [...packs.flatMap(pack => pack.assets), ...extraAssets];
const mixedAssets = mixedSlots.map(id => allAssets.find(asset => asset.id === id)!);
const mixedPack = { label: "Mix · 人文与晴空", description: "人文与玻璃照片、馆藏建筑版画，以及少量深蓝天空；32 张独立素材。", assets: mixedAssets };
const mixedImages = mixedAssets.map(asset => asset.src);
const legacyImages = mappings.map(mapping => devinSlots.map(item => mapping[item.src.split("/").pop()!.replace(".webp", "")].src));
const versions = ["a", "b", "mix"] as const;
type View = typeof versions[number] | "compare" | "original";

export function ThemeCompareDemo() {
  const [view, setView] = useState<View>("mix");
  const [divider, setDivider] = useState(50);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [density, setDensity] = useState(32);
  const [blur, setBlur] = useState(6);
  const [epoch, setEpoch] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const { reduced, paused: globalPaused, slow } = useMotionSettings();
  const stopped = reduced || globalPaused || paused;
  const rate = speed * (slow ? .5 : 1);
  const sourcePacks = view === "mix" ? [mixedPack] : packs;
  useDevinMotion(root, { stopped, rate, density, epoch });

  function moveDivider(clientX: number) {
    const bounds = root.current?.getBoundingClientRect();
    if (bounds) setDivider(Math.round(Math.min(90, Math.max(10, (clientX - bounds.left) / bounds.width * 100))));
  }

  return <div>
    <div className={s.heading}>
      <div className={s.switcher} role="group" aria-label="素材版本对比">
        {([['mix', 'Mix · 人文与晴空'], ['original', 'Devin 原图'], ['a', 'A · 静读与人文'], ['b', 'B · 理性与探索'], ['compare', 'A/B 左右对照']] as const).map(([id, label]) => <MotionButton key={id} variant={view === id ? "secondary" : "ghost"} size="sm" aria-pressed={view === id} onClick={() => setView(id)}>{label}</MotionButton>)}
      </div>
      <p>{view === "mix" || view === "original" ? "暂停后切换 Mix 与 Devin 原图，可对照同一帧。" : view === "compare" ? "同一布局、同一运动进度，只比较素材。" : packs[view === "a" ? 0 : 1].description}</p>
    </div>
    <div ref={root} className={base.stage} aria-label="人文与科技背景对比" data-theme-view={view} data-theme-rate={rate} data-theme-stopped={stopped} style={{ "--split": `${divider}%` } as CSSProperties}>
      {versions.map((version, p) => <div key={version} className={`${s.surface} ${version === "mix" ? "" : s.legacy}`} data-version={version} style={{ clipPath: view === "compare" ? p === 0 ? `inset(0 ${100 - divider}% 0 0)` : `inset(0 0 0 ${divider}%)` : undefined, visibility: (view === "compare" ? version === "mix" : view === "original" ? version !== "mix" : view !== version) ? "hidden" : undefined }}>
        <DevinLayers images={version === "mix" ? view === "original" ? devinImages : mixedImages : legacyImages[p]} density={density} blur={blur}
          foregroundOpacity={version === "mix" && view === "mix" ? 0.76 : 1} />
      </div>)}
      {view === "compare" && <div className={s.badges} aria-hidden="true"><span>A · 静读与人文</span><span>B · 理性与探索</span></div>}
      {view === "compare" && <div className={s.divider} role="slider" tabIndex={0} aria-label="画布对照分界" aria-valuemin={10} aria-valuemax={90} aria-valuenow={divider} aria-valuetext={`A ${divider}%，B ${100 - divider}%`} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); moveDivider(e.clientX); }} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) moveDivider(e.clientX); }} onKeyDown={e => {
        const changes: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 };
        const change = changes[e.key];
        if (change !== undefined) { e.preventDefault(); setDivider(n => Math.min(90, Math.max(10, n + change))); }
        else if (e.key === "Home" || e.key === "End") { e.preventDefault(); setDivider(e.key === "Home" ? 10 : 90); }
      }}><span aria-hidden="true">↔</span></div>}
    </div>
    <div className={base.controls}>
      {view === "compare" && <label className={s.wipe}><span>对照分界<output>A {divider}% / B {100 - divider}%</output></span><input type="range" aria-label="左右对照分界" min="10" max="90" step="1" value={divider} onChange={e => setDivider(Number(e.target.value))} /></label>}
      <div className={base.sliders}>
        <label><span>移动速度<output>{speed}×</output></span><input aria-label="主题背景移动速度" type="range" min=".25" max="3" step=".25" value={speed} onChange={e => setSpeed(Number(e.target.value))} /></label>
        <label><span>每版图片密度<output>{density} 张</output></span><input aria-label="主题背景图片密度" type="range" min="8" max="32" step="2" value={density} onChange={e => setDensity(Number(e.target.value))} /></label>
        <label><span>远层模糊<output>{blur} px</output></span><input aria-label="主题背景远层模糊" type="range" min="0" max="10" step=".5" value={blur} onChange={e => setBlur(Number(e.target.value))} /></label>
      </div>
      <div className={base.actions}><MotionButton size="sm" variant="outline" disabled={reduced || globalPaused} onClick={() => setPaused(!paused)}>{paused ? <Play size={13} /> : <Pause size={13} />}{paused ? "播放主题背景" : "暂停主题背景"}</MotionButton><MotionButton size="sm" variant="ghost" onClick={() => { setSpeed(1); setDensity(32); setBlur(6); setPaused(false); setDivider(50); setEpoch(n => n + 1); }}><RotateCcw size={13} />恢复原版参数</MotionButton><span className={s.palette}><i /><i /><i /><i />深蓝 · 石灰 · 银灰</span></div>
      <p className={base.status} role="status">{reduced ? "已减少动态：所有版本保持静止。" : globalPaused ? "已跟随全局暂停。" : paused ? "已暂停，可以切换版本比较同一位置的配图。" : `正在播放 ${rate}× · Devin 原版节奏 · 可暂停后切换素材对照。`}</p>
      {view === "original" ? <a className={s.referenceLink} href="https://devin.ai/" target="_blank" rel="noreferrer">图片来源：Devin 首页 ↗</a> : <details className={s.sources}><summary>查看当前素材与来源 <span>{view === "mix" ? "32 张 · 无重复" : "A 10 张 · B 9 张"}</span></summary><div className={`${s.boards} ${view === "mix" ? s.mixedBoard : ""}`}>{sourcePacks.map((pack, p) => <section key={pack.label}><h4>{view === "mix" ? pack.label : `${p === 0 ? "A" : "B"} · ${pack.label}`}</h4><p>{pack.description}</p><div className={s.thumbs}>{pack.assets.map(asset => <a key={asset.id} href={asset.source} target="_blank" rel="noreferrer" aria-label={`${asset.label} · 查看素材来源`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.src} alt={asset.label} width={160} height={120} loading="lazy" className={view === "mix" ? undefined : s.photo} /><span>{asset.label} ↗</span></a>)}</div></section>)}</div><p className={s.sourceNote}>照片来自 Unsplash；建筑版画来自 Wellcome Collection 馆藏（部分由 Wikimedia 提供）。各项链接可查看来源。仅用于预览，原图与槽位映射随代码保留。</p></details>}
    </div>
  </div>;
}
