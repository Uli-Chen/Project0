import { AlertCircle, LoaderCircle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 一笔画出的勾号；系统减少动态效果时直接显示 */
export function DrawnCheck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("motion-check size-4 shrink-0", className)}>
      <path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export type AsyncStatus = "idle" | "pending" | "success" | "error";

/**
 * 由调用方的真实请求驱动的按钮：等待、成功、失败各有一个就地状态。
 * 所有状态叠在同一格里，按钮宽度取最宽的那个，切换时不跳动。
 */
export function StatusButton({
  status,
  children,
  pendingLabel,
  successLabel,
  errorLabel,
  disabled,
  ...props
}: ComponentProps<typeof Button> & { status: AsyncStatus; pendingLabel?: ReactNode; successLabel?: ReactNode; errorLabel?: ReactNode }) {
  const states: [AsyncStatus, ReactNode][] = [
    ["idle", children],
    ["pending", <><LoaderCircle className="animate-spin" />{pendingLabel ?? children}</>],
    ...(successLabel ? [["success", <><DrawnCheck />{successLabel}</>] as [AsyncStatus, ReactNode]] : []),
    ...(errorLabel ? [["error", <><AlertCircle />{errorLabel}</>] as [AsyncStatus, ReactNode]] : []),
  ];
  const shown = states.some(([key]) => key === status) ? status : "idle";
  return (
    <Button {...props} disabled={disabled || status === "pending"} aria-busy={status === "pending" || undefined}>
      <span className="grid">
        {states.map(([key, content]) => (
          <span key={key} aria-hidden={key !== shown || undefined} className={cn("col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5", key === shown ? "motion-swap" : "invisible")}>
            {content}
          </span>
        ))}
      </span>
    </Button>
  );
}
