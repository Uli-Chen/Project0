"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useMotionSettings } from "./provider";
import s from "./collage.module.css";

export type MotionCollageProps = {
  /** Decorative, noninteractive content only. Do not use real user documents. */
  items: ReactNode[];
  speed?: number;
  density?: number;
  blur?: number;
  paused?: boolean;
};

const slots = Array.from({ length: 32 }, (_, i) => ({
  far: i % 2 === 0,
  phase: (0.16 + i * 0.618034) % 1,
  row: ((Math.floor(i / 2) % 4) / 3) * 0.92 + (i % 3) * 0.025,
  width: [158, 188, 138, 172, 150, 204][i % 6],
  duration: [112, 67, 143, 84, 126, 73][i % 6] * 1000,
}));
const clamp = (n: number, min: number, max: number, fallback: number) => Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;

/** Native transform animations preserve their playhead when speed changes. */
export function MotionCollage({ items, speed = 1, density = 20, blur = 4, paused = false }: MotionCollageProps) {
  const root = useRef<HTMLDivElement>(null);
  const sync = useRef<() => void>(() => {});
  const { reduced, paused: globalPaused, slow } = useMotionSettings();
  const count = Math.round(clamp(density, 8, 32, 20));
  const rate = clamp(speed, 0.25, 3, 1) * (slow ? 0.5 : 1);
  const depthBlur = clamp(blur, 0, 10, 4);
  const options = useRef({ stopped: true, rate, count });

  useEffect(() => {
    options.current = { stopped: paused || globalPaused || reduced, rate, count };
    sync.current();
  }, [paused, globalPaused, reduced, rate, count]);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const cards = Array.from(element.querySelectorAll<HTMLElement>("[data-collage-item]"));
    let animations: Animation[] = [];
    let visible = false;
    let width = 0;
    const update = () => animations.forEach((animation, i) => {
      animation.updatePlaybackRate(options.current.rate);
      if (options.current.stopped || !visible || document.hidden || i >= options.current.count) animation.pause();
      else animation.play();
    });
    sync.current = update;
    const resize = () => {
      const nextWidth = element.clientWidth;
      if (!nextWidth || nextWidth === width) return;
      width = nextWidth;
      const times = animations.map(a => typeof a.currentTime === "number" ? a.currentTime : undefined);
      animations.forEach(a => a.cancel());
      animations = cards.map((card, i) => {
        const animation = card.animate(
          [{ transform: "translate3d(-250px,0,0)" }, { transform: `translate3d(${width + 40}px,0,0)` }],
          { duration: slots[i].duration, iterations: Infinity, easing: "linear" },
        );
        animation.pause();
        animation.currentTime = times[i] ?? slots[i].phase * slots[i].duration;
        return animation;
      });
      update();
    };
    const resizeObserver = new ResizeObserver(resize);
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    resizeObserver.observe(element);
    intersection.observe(element);
    document.addEventListener("visibilitychange", update);
    resize();
    return () => {
      sync.current = () => {};
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", update);
      animations.forEach(a => a.cancel());
    };
  }, []);

  return <div ref={root} className={s.field} aria-hidden="true" inert data-collage-count={count} data-collage-rate={rate} data-collage-stopped={paused || globalPaused || reduced}>
    {slots.map((slot, i) => <div key={i} data-collage-item={i} data-depth={slot.far ? "far" : "near"} className={s.drift} style={{
      display: i < count ? undefined : "none",
      "--card-width": `${slot.width}px`, "--row": slot.row,
      filter: `blur(${slot.far ? depthBlur : depthBlur * 0.12}px)`,
    } as CSSProperties}><div className={s.art}>{items.length ? items[(i + Math.floor(i / 8) * 3) % items.length] : null}</div></div>)}
  </div>;
}
