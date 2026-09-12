"use client";

import { useEffect, useRef } from "react";
import { useBackgroundViewport } from "@/components/background/BackgroundProvider";
import { createMatrixGlyphAtlas, drawMatrixGlyph, MATRIX_GLYPHS } from "@/components/background/MatrixGlyphAtlas";
import type { MatrixSlimSettings } from "@/lib/background/matrix";
import type { MotionFocus } from "@/components/motion/MotionProvider";
import type { PerformanceMode } from "@/lib/motion/performance";
import { getLivePlaybackDiagnostics, LIVE_PLAYBACK_DIAGNOSTICS_STORAGE_KEY } from "@/lib/live/playback-diagnostics";

type Stream = { baseX: number; x: number; y: number; speed: number; length: number; depth: number; size: number; glyphs: Uint16Array; trailAlpha: Float32Array; glyphChangeAt: number };
type Pulse = { x: number; y: number; startedAt: number };
type PointerState = { x: number; y: number; pendingX: number; pendingY: number; active: boolean; lastActivity: number; hoverX: number; hoverY: number; hoverRadius: number };

const INTERACTIVE_SELECTOR = "a,button,input,select,textarea,label,video,canvas,[role='button'],[role='dialog'],[contenteditable='true'],.tip-menu,.wallet-pill,.maya-support-widget,.game-stage";
const CLEARING_SELECTOR = ".admin-auth-panel,.admin-card,.tip-menu,.wallet-pill,.game-card,.faq-item,form,[role='dialog']";
const LIVE_STATUSES = new Set(["loading", "connecting", "buffering", "starting", "live", "paused"]);

function random(minimum: number, maximum: number) { return minimum + Math.random() * (maximum - minimum); }
function varied(minimum: number, maximum: number, randomness: number) { const middle = (minimum + maximum) / 2; return middle + (random(minimum, maximum) - middle) * randomness; }
function randomGlyphs(length: number) { const glyphs = new Uint16Array(length); for (let index = 0; index < length; index += 1) glyphs[index] = Math.floor(Math.random() * MATRIX_GLYPHS.length); return glyphs; }
function trailAlpha(length: number, settings: MatrixSlimSettings) {
  const values = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const trail = 1 - index / Math.max(1, length);
    const visibleTrail = Math.max(0, (trail - (1 - settings.trailLength)) / Math.max(0.01, settings.trailLength));
    values[index] = Math.pow(visibleTrail, 1.3 / settings.fadeDistance);
  }
  return values;
}

function createStream(width: number, height: number, settings: MatrixSlimSettings): Stream {
  const length = Math.round(varied(settings.minimumStreamLength, settings.maximumStreamLength + 1, settings.randomness));
  const depth = random(Math.max(0.15, 1 - settings.depthVariation), 1);
  const size = settings.characterSize * (0.72 + depth * 0.28);
  return { baseX: random(size, Math.max(size, width - size)), x: 0, y: random(-height, height), speed: varied(settings.minimumSpeed, settings.maximumSpeed, settings.randomness) * (0.7 + depth * 0.3), length, depth, size, glyphs: randomGlyphs(length), trailAlpha: trailAlpha(length, settings), glyphChangeAt: 0 };
}

function targetStreamCount(width: number, height: number, settings: MatrixSlimSettings, mobile: boolean) {
  const areaScale = Math.max(0.55, Math.min(2.2, width * height / (1440 * 900)));
  const mobileScale = mobile ? settings.mobileDensityScale : 1;
  const qualityScale = settings.quality === "low" ? 0.62 : settings.quality === "medium" ? 0.82 : settings.quality === "ultra" ? 1.08 : 1;
  return Math.round(Math.max(12, Math.min(120, settings.streamCount * settings.density * areaScale * mobileScale * qualityScale)));
}

function isSafeBackgroundEvent(event: PointerEvent) {
  return event.button === 0 && event.target instanceof Element && !event.target.closest(INTERACTIVE_SELECTOR);
}

function publishDevDiagnostics() {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LIVE_PLAYBACK_DIAGNOSTICS_STORAGE_KEY, JSON.stringify(getLivePlaybackDiagnostics().getSnapshot()));
  } catch {
    // Diagnostics must never interfere with the background renderer.
  }
}

export default function MatrixSlimCanvas({ settings, performanceMode = "FULL", focus = "default" }: { settings: MatrixSlimSettings; performanceMode?: PerformanceMode; focus?: MotionFocus }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewport = useBackgroundViewport();
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const performanceModeRef = useRef(performanceMode);
  performanceModeRef.current = performanceMode;
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const viewportReady = Boolean(viewport);

  useEffect(() => {
    const canvas = canvasRef.current;
    const initialViewport = viewportRef.current;
    if (!canvas || !initialViewport || !settings.enabled) return;
    const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!context) return;

    const atlas = createMatrixGlyphAtlas(settings.characterSize, [settings.deepGrayColor, settings.darkGrayColor, settings.mediumGrayColor, settings.lightGrayColor, settings.leadingColor], settings.glowStrength);
    const streams: Stream[] = [];
    const pulses: Pulse[] = [];
    const pointer: PointerState = { x: -9999, y: -9999, pendingX: -9999, pendingY: -9999, active: false, lastActivity: performance.now(), hoverX: 0, hoverY: 0, hoverRadius: 0 };
    let animationFrame = 0;
    let lastFrame = 0;
    let scrollBoostUntil = 0;
    let live = false;
    let disposed = false;
    let previousWidth = initialViewport.width;
    let previousHeight = initialViewport.height;
    let metricStartedAt = performance.now();
    let metricFrames = 0;
    let metricRenderTime = 0;

    const resize = (nextViewport: NonNullable<typeof viewport>) => {
      const mobile = nextViewport.width <= 760;
      const deviceRatio = settings.dynamicResolution ? nextViewport.pixelRatio : window.devicePixelRatio || 1;
      const ratio = Math.min(deviceRatio, settings.pixelRatioLimit, mobile ? 1.5 : 2);
      canvas.width = Math.max(1, Math.round(nextViewport.width * ratio));
      canvas.height = Math.max(1, Math.round(nextViewport.height * ratio));
      canvas.style.width = `${nextViewport.width}px`;
      canvas.style.height = `${nextViewport.height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const lowPowerScale = settings.lowPowerFallback && nextViewport.performanceTier === "low" ? 0.62 : 1;
      const desiredCount = Math.max(12, Math.round(targetStreamCount(nextViewport.width, nextViewport.height, settings, mobile) * lowPowerScale));
      for (const stream of streams) {
        stream.baseX = Math.min(nextViewport.width - stream.size, Math.max(stream.size, stream.baseX * nextViewport.width / Math.max(1, previousWidth)));
        stream.y *= nextViewport.height / Math.max(1, previousHeight);
      }
      while (streams.length < desiredCount) streams.push(createStream(nextViewport.width, nextViewport.height, settings));
      if (streams.length > desiredCount) streams.length = desiredCount;
      previousWidth = nextViewport.width;
      previousHeight = nextViewport.height;
    };
    resize(initialViewport);

    const markActivity = () => { pointer.lastActivity = performance.now(); };
    const onPointerMove = (event: PointerEvent) => {
      pointer.pendingX = event.clientX;
      pointer.pendingY = event.clientY;
      pointer.active = true;
      markActivity();
      if (settings.hoverClearingEnabled && event.target instanceof Element) {
        const panel = event.target.closest(CLEARING_SELECTOR);
        const rect = panel?.getBoundingClientRect();
        pointer.hoverX = rect ? rect.left + rect.width / 2 : 0;
        pointer.hoverY = rect ? rect.top + rect.height / 2 : 0;
        pointer.hoverRadius = rect ? Math.max(rect.width, rect.height) * 0.68 : 0;
      }
    };
    const onPointerLeave = () => { pointer.active = false; pointer.hoverRadius = 0; };
    const onPointerDown = (event: PointerEvent) => {
      markActivity();
      if (!settings.clickPulseEnabled || viewportRef.current?.reducedMotion || !isSafeBackgroundEvent(event)) return;
      pulses.push({ x: event.clientX, y: event.clientY, startedAt: performance.now() });
      if (pulses.length > 4) pulses.shift();
    };
    const onScroll = () => { markActivity(); if (settings.scrollReactivityEnabled) scrollBoostUntil = performance.now() + 220; };
    const onStreamStatus = (event: Event) => {
      live = LIVE_STATUSES.has(String((event as CustomEvent<{ status?: string }>).detail?.status || ""));
      if (viewportRef.current?.reducedMotion) scheduleFrame();
    };
    const onViewport = (event: Event) => {
      const nextViewport = (event as CustomEvent<NonNullable<typeof viewport>>).detail;
      const currentViewport = viewportRef.current;
      const heightOnlyScrollShift = currentViewport
        && currentViewport.orientation === nextViewport.orientation
        && currentViewport.width === nextViewport.width
        && Math.abs(currentViewport.height - nextViewport.height) < 96;
      if (heightOnlyScrollShift) return;
      viewportRef.current = nextViewport;
      resize(nextViewport);
      if (nextViewport.reducedMotion) scheduleFrame();
    };

    const scheduleFrame = () => {
      if (disposed || animationFrame || (settings.pauseWhenHidden && document.hidden)) return;
      animationFrame = requestAnimationFrame(draw);
    };
    const onVisibilityChange = () => {
      if (settings.pauseWhenHidden && document.hidden) {
        if (animationFrame) cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        return;
      }
      lastFrame = 0;
      metricStartedAt = performance.now();
      metricFrames = 0;
      metricRenderTime = 0;
      scheduleFrame();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("xmf:stream-playback", onStreamStatus as EventListener);
    window.addEventListener("xmf:background-viewport", onViewport as EventListener);
    document.addEventListener("visibilitychange", onVisibilityChange);

    function draw(now: number) {
      animationFrame = 0;
      if (disposed || !canvas || !context) return;
      if (settings.pauseWhenHidden && document.hidden) return;
      const currentViewport = viewportRef.current;
      if (!currentViewport) { scheduleFrame(); return; }
      const mobile = currentViewport.width <= 760;
      pointer.x = pointer.pendingX;
      pointer.y = pointer.pendingY;
      const currentPerformanceMode = performanceModeRef.current;
      const backgroundMode = focusRef.current === "game" && currentPerformanceMode === "FULL" ? "BALANCED" : currentPerformanceMode;
      const lowPowerFps = settings.lowPowerFallback && currentViewport.performanceTier === "low" ? 30 : settings.maximumFps;
      const modeFps = backgroundMode === "REDUCED" ? Math.min(30, lowPowerFps) : backgroundMode === "BALANCED" ? Math.min(45, lowPowerFps) : lowPowerFps;
      const targetFps = mobile ? Math.min(45, modeFps) : modeFps;
      const frameInterval = 1000 / targetFps;
      const elapsed = lastFrame ? now - lastFrame : frameInterval;
      if (targetFps < 58 && elapsed < frameInterval - 0.5) { scheduleFrame(); return; }
      const delta = Math.min(0.033, Math.max(0.001, elapsed / 1000));
      lastFrame = targetFps < 58 ? now - (elapsed % frameInterval) : now;
      const renderStartedAt = performance.now();
      const idle = settings.idleCalmEnabled && now - pointer.lastActivity > settings.idleDelay * 1000;
      const liveFactor = live ? settings.liveIntensity : 1;
      const idleFactor = idle ? settings.idleIntensity : 1;
      const scrollFactor = now < scrollBoostUntil ? settings.scrollSpeedMultiplier : 1;
      const motionFactor = currentViewport.reducedMotion ? 0 : liveFactor * idleFactor * scrollFactor;
      const alphaFactor = settings.globalOpacity * settings.streamOpacity * settings.brightness * liveFactor * idleFactor;

      context.fillStyle = settings.backgroundColor;
      context.fillRect(0, 0, currentViewport.width, currentViewport.height);
      context.save();
      context.globalCompositeOperation = "source-over";
      const filters: string[] = [];
      if (settings.contrast !== 1) filters.push(`contrast(${settings.contrast})`);
      if (settings.blurAmount) filters.push(`blur(${settings.blurAmount}px)`);
      context.filter = filters.length ? filters.join(" ") : "none";

      for (let index = pulses.length - 1; index >= 0; index -= 1) {
        if (now - pulses[index].startedAt > 1000) pulses.splice(index, 1);
      }

      const streamLimit = backgroundMode === "REDUCED" ? Math.ceil(streams.length * 0.5) : backgroundMode === "BALANCED" ? Math.ceil(streams.length * 0.75) : streams.length;
      for (let streamIndex = 0; streamIndex < streamLimit; streamIndex += 1) {
        const stream = streams[streamIndex];
        if (motionFactor) stream.y += stream.speed * motionFactor * delta;
        if (stream.y - stream.length * stream.size > currentViewport.height) {
          stream.y = random(-currentViewport.height * 0.8, -stream.size);
          stream.baseX = random(stream.size, Math.max(stream.size, currentViewport.width - stream.size));
        }
        if (now >= stream.glyphChangeAt) {
          stream.glyphs[Math.floor(Math.random() * stream.glyphs.length)] = Math.floor(Math.random() * MATRIX_GLYPHS.length);
          stream.glyphChangeAt = now + settings.characterChangeRate * random(0.7, 1.3);
        }

        let targetOffset = 0;
        if (settings.mouseRepelEnabled && pointer.active && !currentViewport.reducedMotion && !idle) {
          const dx = stream.baseX - pointer.x;
          const dy = Math.max(0, Math.abs(stream.y - pointer.y) - stream.length * stream.size * 0.45);
          const distance = Math.hypot(dx, dy);
          if (distance < settings.repelRadius) targetOffset += Math.sign(dx || 1) * settings.repelStrength * (1 - distance / settings.repelRadius) * liveFactor;
        }
        for (let index = pulses.length - 1; index >= 0; index -= 1) {
          const pulse = pulses[index];
          const age = now - pulse.startedAt;
          const radius = settings.clickPulseRadius * (age / 1000);
          const distance = Math.abs(stream.baseX - pulse.x);
          if (Math.abs(distance - radius) < 48) targetOffset += Math.sign(stream.baseX - pulse.x || 1) * settings.clickPulseStrength * (1 - age / 1000) * liveFactor;
        }
        const returnBlend = Math.min(1, delta * (1000 / settings.returnSpeed) * 5);
        stream.x += (targetOffset - stream.x) * returnBlend;

        for (let glyph = 0; glyph < stream.length; glyph += 1) {
          const y = stream.y - glyph * stream.size;
          if (y < -stream.size || y > currentViewport.height + stream.size) continue;
          const trail = 1 - glyph / Math.max(1, stream.length);
          const depthAlpha = 0.28 + stream.depth * 0.72;
          context.globalAlpha = alphaFactor * depthAlpha * stream.trailAlpha[glyph];
          const colorRow = glyph === 0 ? 4 : trail > 0.72 ? 3 : trail > 0.46 ? 2 : trail > 0.2 ? 1 : 0;
          drawMatrixGlyph(context, atlas, stream.glyphs[glyph], colorRow, stream.baseX + stream.x, y, stream.size);
        }
      }
      context.restore();

      if (settings.clickPulseEnabled && !currentViewport.reducedMotion) {
        for (const pulse of pulses) {
          const age = now - pulse.startedAt;
          const radius = settings.clickPulseRadius * Math.min(1, age / 1000);
          context.beginPath();
          context.arc(pulse.x, pulse.y, radius, 0, Math.PI * 2);
          context.strokeStyle = settings.lightGrayColor;
          context.globalAlpha = 0.1 * (1 - age / 1000) * liveFactor;
          context.lineWidth = 1;
          context.stroke();
        }
      }
      if (settings.hoverClearingEnabled && pointer.hoverRadius > 0) {
        const gradient = context.createRadialGradient(pointer.hoverX, pointer.hoverY, 0, pointer.hoverX, pointer.hoverY, pointer.hoverRadius);
        gradient.addColorStop(0, "rgba(0,0,0,.72)");
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        context.globalAlpha = 1;
        context.fillStyle = gradient;
        context.fillRect(pointer.hoverX - pointer.hoverRadius, pointer.hoverY - pointer.hoverRadius, pointer.hoverRadius * 2, pointer.hoverRadius * 2);
      }
      context.globalAlpha = settings.overlayOpacity;
      context.fillStyle = "#000000";
      context.fillRect(0, 0, currentViewport.width, currentViewport.height);
      context.globalAlpha = 1;
      metricFrames += 1;
      metricRenderTime += performance.now() - renderStartedAt;
      if (now - metricStartedAt >= 1000) {
        const fps = Math.round(metricFrames * 1000 / (now - metricStartedAt));
        const frameMs = metricRenderTime / Math.max(1, metricFrames);
        canvas.dataset.fps = String(fps);
        canvas.dataset.frameMs = frameMs.toFixed(2);
        getLivePlaybackDiagnostics().matrixSample(fps, frameMs);
        publishDevDiagnostics();
        metricStartedAt = now;
        metricFrames = 0;
        metricRenderTime = 0;
      }
      if (!currentViewport.reducedMotion) scheduleFrame();
    }

    scheduleFrame();
    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("xmf:stream-playback", onStreamStatus as EventListener);
      window.removeEventListener("xmf:background-viewport", onViewport as EventListener);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      streams.length = 0;
      pulses.length = 0;
      canvas.width = 1;
      canvas.height = 1;
    };
  }, [settings, viewportReady]);

  return <canvas ref={canvasRef} className="background-engine-canvas" aria-hidden="true" />;
}
