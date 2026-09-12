"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRafLoop } from "@/hooks/useRafLoop";
import { moreConservativeMode, selectAdaptiveMode, type PerformanceMode } from "@/lib/motion/performance";

export type MotionModeSetting = "AUTO" | PerformanceMode;
export type MotionFocus = "default" | "live" | "game" | "admin";
export type MotionMetrics = { fps: number; averageFrameTime: number; longFrameRate: number; longTasks: number; layoutShifts: number; visible: boolean };
type MotionContextValue = {
  modeSetting: MotionModeSetting;
  autoMode: PerformanceMode;
  effectiveMode: PerformanceMode;
  focus: MotionFocus;
  reducedMotion: boolean;
  metrics: MotionMetrics;
  backgroundEffectLevel: "full" | "balanced" | "reduced";
  setModeSetting: (mode: MotionModeSetting) => void;
};

const defaultMetrics: MotionMetrics = { fps: 60, averageFrameTime: 16.67, longFrameRate: 0, longTasks: 0, layoutShifts: 0, visible: true };
const MotionContext = createContext<MotionContextValue | null>(null);

function constrainedDevice() {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return Boolean(nav.connection?.saveData) || (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) || (navigator.hardwareConcurrency || 4) <= 2;
}

function routeFocus(pathname: string): MotionFocus {
  if (pathname.startsWith("/games")) return "game";
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/live") || pathname === "/") return "live";
  return "default";
}

export default function MotionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const [modeSetting, setModeSettingState] = useState<MotionModeSetting>("AUTO");
  const [autoMode, setAutoMode] = useState<PerformanceMode>("FULL");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [visible, setVisible] = useState(true);
  const [metrics, setMetrics] = useState(defaultMetrics);
  const longTasksRef = useRef(0);
  const layoutShiftsRef = useRef(0);
  const frameStateRef = useRef({ samples: [] as number[], startedAt: 0, long: 0 });
  const focus = routeFocus(pathname);

  useEffect(() => {
    setAutoMode(constrainedDevice() ? "BALANCED" : "FULL");
    try {
      const stored = localStorage.getItem("xmf-motion-mode");
      if (stored === "AUTO" || stored === "FULL" || stored === "BALANCED" || stored === "REDUCED") setModeSettingState(stored);
    } catch {}
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const updateVisibility = () => setVisible(document.visibilityState === "visible");
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    const observers: PerformanceObserver[] = [];
    try {
      const observer = new PerformanceObserver((list) => { longTasksRef.current += list.getEntries().length; });
      observer.observe({ type: "longtask", buffered: true });
      observers.push(observer);
    } catch {}
    try {
      const observer = new PerformanceObserver((list) => { layoutShiftsRef.current += list.getEntries().length; });
      observer.observe({ type: "layout-shift", buffered: true });
      observers.push(observer);
    } catch {}
    return () => observers.forEach((observer) => observer.disconnect());
  }, []);

  const observeFrame = useCallback((_time: number, delta: number) => {
    if (!delta) return;
    const state = frameStateRef.current;
    if (!state.startedAt) state.startedAt = performance.now();
    state.samples.push(delta);
    if (delta > 50) state.long += 1;
    while (state.samples.length > 120) state.samples.shift();
    const now = performance.now();
    if (now - state.startedAt < 1000) return;
    const elapsed = Math.max(1, now - state.startedAt);
    const fps = state.samples.length * 1000 / elapsed;
    const averageFrameTime = state.samples.reduce((sum, value) => sum + value, 0) / Math.max(1, state.samples.length);
    const longFrameRate = state.long * 100 / Math.max(1, state.samples.length);
    setMetrics({ fps, averageFrameTime, longFrameRate, longTasks: longTasksRef.current, layoutShifts: layoutShiftsRef.current, visible: true });
    const nextAuto = selectAdaptiveMode({ fps, longFrameRate, current: autoMode, constrainedDevice: constrainedDevice() });
    if (nextAuto !== autoMode) setAutoMode(nextAuto);
    state.samples.length = 0;
    state.long = 0;
    state.startedAt = now;
  }, [autoMode]);

  useRafLoop(observeFrame, visible);

  useEffect(() => {
    if (!visible) setMetrics((current) => ({ ...current, visible: false }));
  }, [visible]);

  const setModeSetting = useCallback((mode: MotionModeSetting) => {
    setModeSettingState(mode);
    try { localStorage.setItem("xmf-motion-mode", mode); } catch {}
  }, []);

  const effectiveMode = moreConservativeMode(modeSetting === "AUTO" ? autoMode : modeSetting, reducedMotion ? "REDUCED" : "FULL");
  const backgroundMode = focus === "game" && effectiveMode === "FULL" ? "BALANCED" : effectiveMode;

  useEffect(() => {
    document.documentElement.dataset.motionMode = effectiveMode;
    document.documentElement.dataset.motionFocus = focus;
    window.dispatchEvent(new CustomEvent("xmf:performance-mode", { detail: { mode: effectiveMode, focus, reducedMotion } }));
    return () => {
      delete document.documentElement.dataset.motionMode;
      delete document.documentElement.dataset.motionFocus;
    };
  }, [effectiveMode, focus, reducedMotion]);

  const value = useMemo<MotionContextValue>(() => ({ modeSetting, autoMode, effectiveMode, focus, reducedMotion, metrics, backgroundEffectLevel: backgroundMode === "FULL" ? "full" : backgroundMode === "BALANCED" ? "balanced" : "reduced", setModeSetting }), [autoMode, backgroundMode, effectiveMode, focus, metrics, modeSetting, reducedMotion, setModeSetting]);
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useMotionState() {
  const value = useContext(MotionContext);
  if (!value) throw new Error("useMotionState must be used inside MotionProvider");
  return value;
}

