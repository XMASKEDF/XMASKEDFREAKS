"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import { defaultVideoProviderConfig, resolveVideoSource, type VideoProviderConfig } from "@/lib/config";
import { getLivePlaybackDiagnostics, LIVE_PLAYBACK_DIAGNOSTICS_STORAGE_KEY } from "@/lib/live/playback-diagnostics";

type PlaybackRuntime = { configured?: boolean; source?: string | null };

function bufferAhead(video: HTMLVideoElement) {
  for (let index = 0; index < video.buffered.length; index += 1) {
    if (video.currentTime >= video.buffered.start(index) && video.currentTime <= video.buffered.end(index)) return Math.max(0, video.buffered.end(index) - video.currentTime);
  }
  return 0;
}

function publishDiagnostics() {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
  const snapshot = getLivePlaybackDiagnostics().getSnapshot();
  try { window.localStorage.setItem(LIVE_PLAYBACK_DIAGNOSTICS_STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* local diagnostics must never affect playback */ }
}

export default function LiveDiagnosticsPlayer() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("Resolving the same Live playback source…");

  useEffect(() => {
    let cancelled = false;
    const startedAt = performance.now();
    Promise.all([
      fetch("/api/live/playback", { cache: "no-store" }).then(async (response) => ({ response, data: await response.json().catch(() => ({})) as PlaybackRuntime })),
      fetch("/api/stream-settings", { cache: "no-store" }).then(async (response) => ({ response, data: await response.json().catch(() => ({})) as { settings?: VideoProviderConfig } }))
    ]).then(([runtimeResult, settingsResult]) => {
      const runtime = runtimeResult.data;
      const settings = settingsResult.data.settings || defaultVideoProviderConfig;
      const resolved = runtime.configured === true ? runtime.source || "" : resolveVideoSource(settings);
      getLivePlaybackDiagnostics().apiRequest("/api/live/playback", performance.now() - startedAt, runtimeResult.response.ok);
      getLivePlaybackDiagnostics().apiRequest("/api/stream-settings", performance.now() - startedAt, settingsResult.response.ok);
      if (cancelled) return;
      setSource(resolved);
      setStatus(resolved ? "Comparison player ready." : "No active playback source is configured.");
      publishDiagnostics();
    }).catch(() => {
      if (!cancelled) setStatus("Playback source could not be resolved.");
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return undefined;
    const diagnostics = getLivePlaybackDiagnostics();
    let disposed = false;
    let sampleTimer: number | null = null;
    diagnostics.startPlayer();
    const onEvent = (event: Event) => {
      diagnostics.videoEvent(event.type);
      if (event.type === "playing") setStatus("Playing.");
      if (event.type === "error") setStatus("Playback error.");
      publishDiagnostics();
    };
    const sample = () => {
      if (disposed || document.hidden) return;
      const qualityReader = video as HTMLVideoElement & { getVideoPlaybackQuality?: () => { droppedVideoFrames?: number; totalVideoFrames?: number } };
      const quality = qualityReader.getVideoPlaybackQuality?.();
      diagnostics.videoSample({
        bufferAheadSeconds: bufferAhead(video),
        droppedFrames: typeof quality?.droppedVideoFrames === "number" ? quality.droppedVideoFrames : null,
        totalFrames: typeof quality?.totalVideoFrames === "number" ? quality.totalVideoFrames : null,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        currentTime: video.currentTime,
        readyState: video.readyState,
        paused: video.paused
      });
      publishDiagnostics();
    };
    ["loadstart", "loadedmetadata", "canplay", "play", "playing", "waiting", "stalled", "seeking", "pause", "ended", "error", "emptied", "abort"].forEach((event) => video.addEventListener(event, onEvent));
    sampleTimer = window.setInterval(sample, 1000);
    const nativeHlsResult = video.canPlayType("application/vnd.apple.mpegurl");
    if (nativeHlsResult) {
      diagnostics.assignSource(source, "native-hls");
      video.src = source;
      video.load();
    } else if (Hls.isSupported()) {
      diagnostics.assignSource(source, "hls-js");
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 30, maxBufferLength: 20, liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 6, capLevelToPlayerSize: true });
      hlsRef.current = hls;
      diagnostics.createHls();
      hls.on(Hls.Events.MEDIA_ATTACHED, () => { if (!disposed && hlsRef.current === hls) { diagnostics.mediaAttached(); hls.loadSource(source); diagnostics.sourceLoaded(); publishDiagnostics(); } });
      hls.on(Hls.Events.ERROR, (_event, data: { type: string; fatal: boolean }) => { diagnostics.hlsError(data.type, data.fatal); publishDiagnostics(); });
      hls.attachMedia(video);
    } else {
      diagnostics.assignSource(source, "unsupported");
      setStatus("This browser does not support HLS playback.");
    }
    publishDiagnostics();
    return () => {
      disposed = true;
      ["loadstart", "loadedmetadata", "canplay", "play", "playing", "waiting", "stalled", "seeking", "pause", "ended", "error", "emptied", "abort"].forEach((event) => video.removeEventListener(event, onEvent));
      if (sampleTimer !== null) window.clearInterval(sampleTimer);
      if (hlsRef.current) { diagnostics.destroyHls(); hlsRef.current.destroy(); hlsRef.current = null; }
      if (video.getAttribute("src") === source) { video.pause(); video.removeAttribute("src"); video.load(); }
      diagnostics.stopPlayer();
      publishDiagnostics();
    };
  }, [source]);

  return <section className="admin-auth-panel" aria-labelledby="live-diagnostics-player-title"><header><div><p className="kicker">MINIMAL COMPARISON PLAYER</p><h2 id="live-diagnostics-player-title">Live source only</h2><p>{status}</p></div><span className="admin-health yellow">NO CONTRIBUTION UI</span></header><video ref={videoRef} className="live-diagnostics-video" controls muted playsInline autoPlay preload="metadata" aria-label="Minimal Live playback comparison player" /></section>;
}
