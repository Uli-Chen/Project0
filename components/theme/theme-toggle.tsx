"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type Theme = "light" | "dark" | "system";
export const THEME_LABEL: Record<Theme, string> = { light: "浅色", dark: "深色", system: "跟随系统" };
export const THEME_ICON = { light: Sun, dark: Moon, system: Monitor };

function stored(): Theme {
  try {
    const saved = localStorage.getItem("p0:theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    const remembered = document.documentElement.dataset.theme;
    if (remembered === "light" || remembered === "dark") return remembered;
  }
  return "system";
}

function apply(value: Theme) {
  document.documentElement.dataset.theme = value;
  document.documentElement.classList.toggle("dark", value === "dark" || (value === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches));
}

/** 主题偏好存在 localStorage；多个控件之间用 p0:theme-change 事件同步 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = (value: Theme) => { setThemeState(value); apply(value); };
    const onMediaChange = () => sync((document.documentElement.dataset.theme as Theme) || stored());
    const onStorage = (event: StorageEvent) => { if (event.key === "p0:theme" || event.key === null) sync(stored()); };
    const onThemeChange = (event: Event) => sync((event as CustomEvent<Theme>).detail);
    sync(stored());
    media.addEventListener("change", onMediaChange);
    window.addEventListener("storage", onStorage);
    window.addEventListener("p0:theme-change", onThemeChange);
    return () => {
      media.removeEventListener("change", onMediaChange);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("p0:theme-change", onThemeChange);
    };
  }, []);
  const setTheme = (value: Theme) => {
    try { localStorage.setItem("p0:theme", value); } catch {}
    window.dispatchEvent(new CustomEvent<Theme>("p0:theme-change", { detail: value }));
  };
  return { theme, setTheme };
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <ToggleGroup value={[theme]} onValueChange={(value) => { if (value[0]) setTheme(value[0] as Theme); }} variant="outline" size="sm" aria-label="外观">
      {(Object.keys(THEME_LABEL) as Theme[]).map((value) => {
        const Icon = THEME_ICON[value];
        return <ToggleGroupItem key={value} value={value} aria-label={THEME_LABEL[value]} className="gap-1.5 px-2.5"><Icon />{THEME_LABEL[value]}</ToggleGroupItem>;
      })}
    </ToggleGroup>
  );
}
