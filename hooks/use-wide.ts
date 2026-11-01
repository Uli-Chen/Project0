import * as React from "react"

const QUERY = "(min-width: 1280px)"

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

/** 作文页三栏需要的宽度；服务端按宽屏渲染，避免桌面端闪出抽屉 */
export function useIsWide() {
  return React.useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => true)
}
