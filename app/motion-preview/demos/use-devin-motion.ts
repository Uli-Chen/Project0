"use client";

import { useEffect, useRef, type RefObject } from "react";
import { devinSlots } from "./devin-layers";

/** Shared playback controls. All image sets resolve timing from the original slot. */
export function useDevinMotion(root: RefObject<HTMLDivElement | null>, { stopped, rate, epoch }: { stopped: boolean; rate: number; density: number; epoch: number }) {
  const sync = useRef<() => void>(() => {});
  const settings = useRef({ stopped, rate });
  useEffect(() => {
    settings.current = { stopped, rate };
    sync.current();
  }, [stopped, rate]);

  useEffect(() => {
    const stage = root.current;
    if (!stage) return;
    let visible = false;
    const cards = Array.from(stage.querySelectorAll<HTMLElement>("[data-devin-card]"));
    const animations = cards.map(card => {
      const spec = devinSlots[Number(card.dataset.devinCard)];
      const animation = card.animate([{ transform: "translateX(0)" }, { transform: "translateX(calc(max(100vw, 1900px) + 260px))" }], {
        duration: spec.duration * 1000, delay: spec.delay * 1000, iterations: Infinity, easing: "linear", fill: "both",
      });
      animation.pause();
      animation.currentTime = 0;
      return animation;
    });
    // Hidden density slots keep their playhead, so restoring them preserves spacing.
    const update = () => animations.forEach(animation => {
      animation.updatePlaybackRate(settings.current.rate);
      if (settings.current.stopped || document.hidden || !visible) animation.pause();
      else animation.play();
    });
    sync.current = update;
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    observer.observe(stage);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      animations.forEach(a => a.cancel());
      sync.current = () => {};
    };
  }, [root, epoch]);
}
