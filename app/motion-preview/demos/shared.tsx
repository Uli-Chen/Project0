"use client";

import { useEffect, useRef, useState } from "react";
import type { AsyncStatus } from "@/components/motion";

/** Mock latency belongs only to the preview. Reusable motion components never own network state. */
export function useDemoJob(delay = 1100) {
  const [status, setStatus] = useState<AsyncStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function run(outcome: "success" | "error" = "success") {
    if (timer.current) clearTimeout(timer.current);
    setStatus("pending");
    timer.current = setTimeout(() => { timer.current = null; setStatus(outcome); }, delay);
  }
  return { status, run };
}
