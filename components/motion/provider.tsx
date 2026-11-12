"use client";

import { MotionConfig, useReducedMotion } from "motion/react";
import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { motionTiming, motionTokens } from "./tokens";
import styles from "./motion.module.css";

type Settings = { reduced: boolean; slow: boolean; paused: boolean };
const MotionContext = createContext<Settings>({ reduced: false, slow: false, paused: false });

export function MotionProvider({ children, reduced = false, slow = false, paused = false }: Partial<Settings> & { children: ReactNode }) {
  const systemReduced = useReducedMotion();
  const settings = { reduced: reduced || !!systemReduced, slow, paused };
  const timing = motionTiming(settings.reduced, slow);
  return <MotionContext.Provider value={settings}>
    <MotionConfig reducedMotion={settings.reduced ? "always" : "user"} transition={{ duration: timing.duration(), ease: motionTokens.ease }}>
      <MotionScope>{children}</MotionScope>
    </MotionConfig>
  </MotionContext.Provider>;
}

export function useMotionSettings() {
  const context = useContext(MotionContext);
  const systemReduced = useReducedMotion();
  const reduced = context.reduced || !!systemReduced;
  const timing = motionTiming(reduced, context.slow);
  const css = {
    "--motion-fast": `${timing.duration("fast")}s`,
    "--motion-standard": `${timing.duration()}s`,
    "--motion-layout": `${timing.duration("layout")}s`,
    "--motion-loop": `${motionTokens.loop * timing.factor}s`,
    "--motion-ease": `cubic-bezier(${motionTokens.ease.join(",")})`,
    "--motion-distance": reduced ? "0px" : `${motionTokens.distance}px`,
  } as CSSProperties;
  return {
    ...context, reduced, ...timing, css,
    transition: (role: "fast" | "standard" | "layout" | "reveal" = "standard") => ({ duration: timing.duration(role), ease: motionTokens.ease }),
    surfaceProps: { style: css, "data-motion-reduced": reduced, "data-motion-paused": context.paused },
  };
}

function MotionScope({ children }: { children: ReactNode }) {
  const { surfaceProps } = useMotionSettings();
  return <div className={styles.scope} {...surfaceProps}>{children}</div>;
}
