"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { PopoverContent } from "@/components/ui/popover";
import { TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useMotionSettings } from "./provider";
import { MotionButton } from "./primitives";
import styles from "./motion.module.css";

export const MotionDialog = BaseDialog.Root;
export const MotionDialogTrigger = BaseDialog.Trigger;
export const MotionDialogClose = BaseDialog.Close;

/** Base UI owns focus trapping, Escape, outside dismissal and focus restoration. */
export function MotionDialogContent({ title, description, children, drawer = false }: { title: string; description: string; children: ReactNode; drawer?: boolean }) {
  const { surfaceProps } = useMotionSettings();
  return <BaseDialog.Portal>
    <BaseDialog.Backdrop className={styles.backdrop} {...surfaceProps} />
    <BaseDialog.Popup className={cn(styles.dialog, drawer && styles.drawer)} {...surfaceProps}>
      <div className={styles.dialogHeading}><BaseDialog.Title className={styles.dialogTitle}>{title}</BaseDialog.Title><BaseDialog.Close render={<MotionButton size="icon-sm" variant="ghost" aria-label="关闭浮层" />}><X size={16} /></BaseDialog.Close></div>
      <BaseDialog.Description className={styles.dialogDescription}>{description}</BaseDialog.Description>
      {children}
    </BaseDialog.Popup>
  </BaseDialog.Portal>;
}

export function MotionPopoverContent({ className, style, ...props }: ComponentProps<typeof PopoverContent>) {
  const { surfaceProps } = useMotionSettings();
  return <PopoverContent {...props} {...surfaceProps} style={{ ...surfaceProps.style, ...style }} className={cn(styles.popup, className)} />;
}

export function MotionMenuContent({ className, style, ...props }: ComponentProps<typeof DropdownMenuContent>) {
  const { surfaceProps } = useMotionSettings();
  return <DropdownMenuContent {...props} {...surfaceProps} style={{ ...surfaceProps.style, ...style }} className={cn(styles.popup, className)} />;
}

export function MotionTooltipContent({ className, style, ...props }: ComponentProps<typeof TooltipContent>) {
  const { surfaceProps } = useMotionSettings();
  return <TooltipContent {...props} {...surfaceProps} style={{ ...surfaceProps.style, ...style }} className={cn(styles.popup, className)} />;
}
