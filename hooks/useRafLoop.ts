"use client";

import { useEffect, useRef } from "react";
import { clampFrameDelta } from "@/lib/motion/performance";

export function useRafLoop(callback: (time: number, delta: number) => void, active = true) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let previous = 0;
    const tick = (time: number) => {
      const delta = previous ? clampFrameDelta(time - previous) : 0;
      previous = time;
      callbackRef.current(time, delta);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [active]);
}

