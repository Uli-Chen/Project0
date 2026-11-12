"use client";

import { AnimatePresence, motion, useAnimationControls, useIsPresent, type HTMLMotionProps } from "motion/react";
import { useEffect, useId, useRef, useState, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { AlertCircle, Check, ChevronDown } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMotionSettings } from "./provider";
import { motionTokens } from "./tokens";
import styles from "./motion.module.css";

export function MotionButton({ className, style, ...props }: ComponentProps<typeof Button>) {
  const { surfaceProps } = useMotionSettings();
  return <Button {...props} {...surfaceProps} className={cn(styles.press, className)} style={{ ...surfaceProps.style, ...style }} />;
}

export function MotionReveal({ children, className, index = 0, ...props }: HTMLMotionProps<"div"> & { index?: number }) {
  const { reduced, transition, delay } = useMotionSettings();
  return <motion.div initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : motionTokens.distance }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 0 }} transition={{ ...transition(), delay: delay(index) }} className={className} {...props}>{children}</motion.div>;
}

/** Immediate enter with an in-place fade; the wrapper keeps focusable children out of duplicate exit trees. */
export function MotionSwap({ children, value, className }: { children: ReactNode; value: string | number; className?: string }) {
  const { reduced, transition } = useMotionSettings();
  return <motion.div key={value} className={className} initial={{ opacity: reduced ? 1 : 0 }} animate={{ opacity: 1 }} transition={transition()}>{children}</motion.div>;
}

export function MotionCollapse({ open, children, id, labelledBy }: { open: boolean; children: ReactNode; id: string; labelledBy?: string }) {
  const { reduced, transition } = useMotionSettings();
  // inert takes effect immediately on close, before the visual exit completes.
  return <motion.div id={id} role={labelledBy ? "region" : undefined} aria-labelledby={labelledBy} aria-hidden={!open} inert={!open} initial={false} animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }} transition={transition("layout")} style={{ overflow: "hidden", visibility: reduced && !open ? "hidden" : undefined }}>
    {children}
  </motion.div>;
}

export function MotionDisclosure({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const { transition } = useMotionSettings();
  return <div className={styles.disclosure}>
    <button type="button" id={`${id}-trigger`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className={styles.disclosureTrigger}>
      {title}<motion.span animate={{ rotate: open ? 180 : 0 }} transition={transition()}><ChevronDown size={15} /></motion.span>
    </button>
    <MotionCollapse open={open} id={id} labelledBy={`${id}-trigger`}><div className={styles.disclosureBody}>{children}</div></MotionCollapse>
  </div>;
}

export type LoaderKind = "bloom" | "dots" | "orbit";
export function MotionLoader({ kind = "orbit", size = 18, label = "加载中" }: { kind?: LoaderKind; size?: number; label?: string }) {
  const { surfaceProps } = useMotionSettings();
  return <span className={styles.loaderWrap} role={label ? "status" : undefined} aria-label={label || undefined} {...surfaceProps}>
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true" className={styles.loader}>
      {kind === "bloom" && [0, 1, 2, 3].map(i => <g key={i} transform={`rotate(${i * 90} 12 12)`}><ellipse cx="12" cy="6.75" rx="2.4" ry="4" fill="currentColor" className={styles.petal} style={{ "--i": i } as CSSProperties} /></g>)}
      {kind === "dots" && [0, 1, 2].map(i => <circle key={i} cx={5 + i * 7} cy="12" r="1.75" fill="currentColor" className={styles.dot} style={{ "--i": i } as CSSProperties} />)}
      {kind === "orbit" && <><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" opacity=".18" /><g className={styles.orbit}><path d="M12 4a8 8 0 0 1 8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></g></>}
    </svg>
  </span>;
}

export function MotionCheck({ size = 18 }: { size?: number }) {
  const { reduced, transition } = useMotionSettings();
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><motion.path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: reduced ? 1 : 0 }} animate={{ pathLength: 1 }} transition={transition("reveal")} /></svg>;
}

export type AsyncStatus = "idle" | "pending" | "success" | "error";
/** Controlled by the caller's real request. Contains no mock delay or API access. */
export function MotionAction({ status, children, pendingLabel = "保存中", successLabel = "已保存", errorLabel = "重试", ...props }: ComponentProps<typeof MotionButton> & { status: AsyncStatus; pendingLabel?: string; successLabel?: string; errorLabel?: string }) {
  return <MotionButton {...props} disabled={props.disabled || status === "pending"} aria-busy={status === "pending"}>
    <MotionSwap value={status} className={styles.inline}>
      {status === "pending" ? <MotionLoader label="" /> : status === "success" ? <MotionCheck /> : status === "error" ? <AlertCircle size={16} /> : null}
      {status === "idle" ? children : status === "pending" ? pendingLabel : status === "success" ? successLabel : errorLabel}
    </MotionSwap>
  </MotionButton>;
}

export function MotionIconButton({ label, children, kind = "nudge", selected, onClick }: { label: string; children: ReactNode; kind?: "ring" | "turn" | "nudge"; selected?: boolean; onClick?: () => void }) {
  const controls = useAnimationControls();
  const { reduced, transition, surfaceProps } = useMotionSettings();
  useEffect(() => { if (reduced) { controls.stop(); controls.set({ rotate: 0, y: 0 }); } }, [reduced, controls]);
  const animate = () => {
    if (reduced) return;
    void controls.start({ rotate: kind === "ring" ? [0, -10, 7, -3, 0] : kind === "turn" ? [0, -180] : 0, y: kind === "nudge" ? [0, -2, 0] : 0, transition: { ...transition("reveal"), type: "tween" } });
  };
  return <motion.button type="button" {...surfaceProps} className={cn(buttonVariants({ variant: "ghost", size: "icon" }), styles.press)} aria-label={label} aria-pressed={selected} onHoverStart={animate} onFocus={animate} onClick={() => { animate(); onClick?.(); }}>
    <motion.span className={styles.inline} initial={{ rotate: 0, y: 0 }} animate={controls} style={{ color: selected ? "var(--primary)" : undefined, transformOrigin: "50% 20%" }}>{children}</motion.span>
  </motion.button>;
}

export function MotionTabs({ items, value, onChange, label }: { items: { value: string; label: string; content: ReactNode }[]; value: string; onChange: (value: string) => void; label: string }) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const { transition } = useMotionSettings();
  const selected = Math.max(0, items.findIndex(item => item.value === value));
  return <div>
    <div className={styles.tabs} role="tablist" aria-label={label}>
      <motion.span aria-hidden="true" className={styles.indicator} style={{ width: `calc((100% - 6px) / ${items.length})` }} animate={{ x: `${selected * 100}%` }} transition={transition("layout")} />
      {items.map((item, i) => <button key={item.value} type="button" role="tab" id={`${id}-tab-${i}`} aria-controls={`${id}-panel`} aria-selected={i === selected} tabIndex={i === selected ? 0 : -1} ref={el => { refs.current[i] = el; }} onClick={() => onChange(item.value)} onKeyDown={e => {
        const next = e.key === "ArrowRight" ? (i + 1) % items.length : e.key === "ArrowLeft" ? (i - 1 + items.length) % items.length : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : -1;
        if (next < 0) return;
        e.preventDefault(); onChange(items[next].value); refs.current[next]?.focus();
      }}>{item.label}</button>)}
    </div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${selected}`} tabIndex={0} className={styles.tabPanel}><MotionSwap value={value}>{items[selected]?.content}</MotionSwap></div>
  </div>;
}

export function MotionList({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn(styles.list, className)}><AnimatePresence initial={false}>{children}</AnimatePresence></ul>;
}

export function MotionListItem({ children, ...props }: HTMLMotionProps<"li">) {
  const { reduced, transition } = useMotionSettings();
  const present = useIsPresent();
  return <motion.li layout={reduced ? false : "position"} initial={{ opacity: reduced ? 1 : 0, height: reduced ? "auto" : 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={transition("layout")} style={{ overflow: "hidden" }} {...props} inert={!present} aria-hidden={!present}>{children}</motion.li>;
}

export function MotionMeter({ value, max = 100, label, tone = "primary" }: { value: number; max?: number; label: string; tone?: "primary" | "muted" | "warn" | "good" }) {
  const { reduced, transition } = useMotionSettings();
  const bounded = Math.min(Math.max(value, 0), max);
  return <div className={styles.meter} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={bounded}><motion.span data-tone={tone} initial={{ scaleX: reduced ? bounded / max : 0 }} animate={{ scaleX: bounded / max }} transition={transition("reveal")} /></div>;
}

export function MotionSkeleton({ lines = 3 }: { lines?: number }) {
  const { surfaceProps } = useMotionSettings();
  return <div className={styles.skeleton} {...surfaceProps} role="status" aria-label="正在读取内容">{Array.from({ length: lines }, (_, i) => <span key={i} style={{ width: i === lines - 1 ? "60%" : i === 0 ? "80%" : "100%" }} />)}</div>;
}

export function MotionNotice({ children, tone = "good", onDismiss }: { children: ReactNode; tone?: "good" | "warn"; onDismiss?: () => void }) {
  return <MotionReveal className={styles.notice} role={tone === "warn" ? "alert" : "status"} data-tone={tone}><span className={styles.inline}>{tone === "good" ? <MotionCheck size={16} /> : <AlertCircle size={16} />}{children}</span>{onDismiss && <MotionButton size="xs" variant="ghost" onClick={onDismiss}>关闭</MotionButton>}</MotionReveal>;
}

export function MotionStep({ done, active, children }: { done: boolean; active: boolean; children: ReactNode }) {
  return <span className={styles.step} data-active={active} data-done={done}><span className={styles.stepIcon}>{done ? <Check size={13} /> : active ? <MotionLoader size={15} label="" /> : <span className={styles.stepDot} />}</span>{children}</span>;
}
