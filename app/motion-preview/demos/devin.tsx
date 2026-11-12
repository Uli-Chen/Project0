"use client";

import { useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { MotionButton, useMotionSettings } from "@/components/motion";
import { useDevinMotion } from "./use-devin-motion";
import { DevinLayers } from "./devin-layers";
import s from "./devin.module.css";

/** Reference-only reproduction using the publicly served Devin collage assets and parameters. */
export function DevinDemo() {
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [density, setDensity] = useState(32);
  const [blur, setBlur] = useState(6);
  const [epoch, setEpoch] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const { reduced, paused: globalPaused, slow } = useMotionSettings();
  const stopped = paused || globalPaused || reduced;
  const rate = speed * (slow ? .5 : 1);
  useDevinMotion(root, { stopped, rate, density, epoch });

  return <div>
    <div ref={root} className={s.stage} aria-label="Devin 原版图片背景" data-devin-stopped={stopped} data-devin-rate={rate}>
      <DevinLayers density={density} blur={blur} />
    </div>
    <div className={s.controls}>
      <div className={s.sliders}>
        <label><span>移动速度<output>{speed}×</output></span><input aria-label="Devin 移动速度" type="range" min=".25" max="3" step=".25" value={speed} onChange={e => setSpeed(Number(e.target.value))} /></label>
        <label><span>图片密度<output>{density} 张</output></span><input aria-label="Devin 图片密度" type="range" min="8" max="32" step="2" value={density} onChange={e => setDensity(Number(e.target.value))} /></label>
        <label><span>远层模糊<output>{blur} px</output></span><input aria-label="Devin 远层模糊" type="range" min="0" max="10" step=".5" value={blur} onChange={e => setBlur(Number(e.target.value))} /></label>
      </div>
      <div className={s.actions}><MotionButton size="sm" variant="outline" disabled={reduced || globalPaused} onClick={() => setPaused(!paused)}>{paused ? <Play size={13} /> : <Pause size={13} />}{paused ? "播放原版背景" : "暂停原版背景"}</MotionButton><MotionButton size="sm" variant="ghost" onClick={() => { setSpeed(1); setDensity(32); setBlur(6); setPaused(false); setEpoch(n => n + 1); }}><RotateCcw size={13} />恢复原版参数</MotionButton><a href="https://devin.ai/" target="_blank" rel="noreferrer">来源：Devin 首页 ↗</a></div>
      <p className={s.status} role="status">{reduced ? "已减少动态：保持静态画面。" : globalPaused ? "已跟随页面的全局暂停。" : paused ? "背景已暂停。" : `正在向右移动 · ${rate}× 速度`}</p>
      <p className={s.caption}>原站图片与运动参数 · 默认 16 + 16 张、6px 远景模糊 · 仅本地参考预览</p>
    </div>
  </div>;
}
