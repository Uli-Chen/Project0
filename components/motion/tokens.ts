/** One motion language for the desk / panel / paper frontend. Seconds, except CSS exports. */
export const motionTokens = {
  fast: 0.12,
  standard: 0.18,
  layout: 0.24,
  reveal: 0.32,
  stagger: 0.035,
  distance: 4,
  press: 0.98,
  loop: 1.8,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
};

export function motionTiming(reduced: boolean, slow: boolean) {
  const factor = slow ? 2 : 1;
  return {
    duration: (role: "fast" | "standard" | "layout" | "reveal" = "standard") => reduced ? 0 : motionTokens[role] * factor,
    delay: (index: number) => reduced ? 0 : Math.min(index, 5) * motionTokens.stagger * factor,
    factor,
  };
}
