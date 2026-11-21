"use client"

import { useEffect, useState } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const [theme, setTheme] = useState<"light" | "dark">("light")
  useEffect(() => {
    const root = document.documentElement
    const sync = () => setTheme(root.classList.contains("dark") ? "dark" : "light")
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4 text-good" />
        ),
        info: (
          <InfoIcon className="size-4 text-coach" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4 text-warn" />
        ),
        error: (
          <OctagonXIcon className="size-4 text-destructive" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast rounded-xl! border-border! bg-popover! text-popover-foreground! shadow-(--shadow-float)!",
          description: "text-muted-foreground!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
