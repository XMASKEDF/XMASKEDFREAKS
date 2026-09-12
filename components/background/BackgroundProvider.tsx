"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { SiteBackgroundSettings } from "@/lib/media/backgrounds";
import { BackgroundResizeManager, type BackgroundViewport } from "@/components/background/BackgroundController";
import MatrixSlimCanvas from "@/components/background/MatrixSlimCanvas";
import { useMotionState } from "@/components/motion/MotionProvider";

const BackgroundViewportContext = createContext<BackgroundViewport | null>(null);

function DevelopmentBackgroundFault() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" && new URLSearchParams(window.location.search).get("xmfBackgroundFault") === "render") setFailed(true);
  }, []);
  if (failed) throw new Error("Intentional background isolation test");
  return null;
}

export function useBackgroundViewport() {
  return useContext(BackgroundViewportContext);
}

export function BackgroundProvider({ settings, active }: { settings: SiteBackgroundSettings; active: boolean }) {
  const { effectiveMode, focus } = useMotionState();
  const managerRef = useRef<BackgroundResizeManager | null>(null);
  const [viewport, setViewport] = useState<BackgroundViewport | null>(null);

  if (!managerRef.current) managerRef.current = new BackgroundResizeManager();

  useEffect(() => {
    const manager = managerRef.current!;
    manager.configure({
      debounceMs: settings.resizeDebounceMs,
      maximumPixelRatio: settings.maximumPixelRatio,
      dynamicResolution: settings.responsiveScaling && settings.dynamicResolution,
      mobilePerformanceMode: settings.responsiveScaling && settings.mobilePerformanceMode,
      automaticGpuOptimization: settings.responsiveScaling && settings.automaticGpuOptimization
    });
    const unsubscribe = manager.subscribe(setViewport);
    manager.start();
    return () => {
      unsubscribe();
      manager.stop();
    };
  }, [settings.resizeDebounceMs, settings.maximumPixelRatio, settings.responsiveScaling, settings.dynamicResolution, settings.mobilePerformanceMode, settings.automaticGpuOptimization]);

  const mobile = (viewport?.width || 1024) <= 720;
  const selectedImageUrl = mobile ? settings.mobileUrl || settings.desktopUrl || settings.fallbackUrl : settings.desktopUrl || settings.fallbackUrl || settings.mobileUrl;
  const matrixFallback = mobile ? "/backgrounds/matrix-slim-gray/matrix-slim-gray-mobile.png" : "/backgrounds/matrix-slim-gray/matrix-slim-gray-reference.png";
  const matrixActive = active && settings.matrixSlim.enabled && ["canvas", "webgl"].includes(settings.backgroundType);
  const imageUrl = selectedImageUrl || (matrixActive ? matrixFallback : "");
  const layerStyle = useMemo(() => ({
    opacity: active ? settings.opacity : 0,
    backgroundColor: "#050505",
    backgroundImage: imageUrl ? `linear-gradient(${settings.overlay}, ${settings.overlay}), url(${imageUrl})` : `linear-gradient(${settings.overlay}, ${settings.overlay})`,
    backgroundPosition: `${settings.focalPointX * 100}% ${settings.focalPointY * 100}%`,
    backgroundSize: settings.maintainAspectRatio ? "cover" : "100% 100%"
  }), [active, imageUrl, settings.opacity, settings.overlay, settings.focalPointX, settings.focalPointY, settings.maintainAspectRatio]);

  const showVideo = active && settings.backgroundType === "video" && settings.videoUrl && !viewport?.reducedMotion;

  return <BackgroundViewportContext.Provider value={viewport}>
      <DevelopmentBackgroundFault />
      <div className="background-engine" aria-hidden="true" data-tier={viewport?.performanceTier || "medium"} data-orientation={viewport?.orientation || "landscape"}>
        <div className="background-engine-media" style={layerStyle} />
        {showVideo ? <video className="background-engine-video" src={settings.videoUrl} poster={imageUrl || undefined} autoPlay muted loop playsInline preload="metadata" style={{ opacity: settings.opacity, objectFit: settings.maintainAspectRatio ? "cover" : "fill", objectPosition: `${settings.focalPointX * 100}% ${settings.focalPointY * 100}%` }} /> : null}
        {matrixActive ? <MatrixSlimCanvas settings={settings.matrixSlim} performanceMode={effectiveMode} focus={focus} /> : null}
      </div>
  </BackgroundViewportContext.Provider>;
}
