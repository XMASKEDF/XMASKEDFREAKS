"use client";

import Hls from "hls.js";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import { usePrivacyConsent } from "@/components/privacy/PrivacyConsentManager";
import { getLivePlaybackDiagnostics, LIVE_PLAYBACK_DIAGNOSTICS_STORAGE_KEY } from "@/lib/live/playback-diagnostics";

export type LiveDeliveryState = "idle" | "loading" | "playing" | "paused" | "destroying" | "destroyed" | "error";

type DeliveryEvent =
  | "live_page_visit"
  | "live_playback_start"
  | "live_playback_stop"
  | "live_playback_resume"
  | "live_route_exit_stop"
  | "live_background_pause"
  | "live_video_never_started"
  | "live_active_watch"
  | "live_unpaid_cutoff"
  | "live_viewing_credit_empty"
  | "live_viewing_credit_resume";

type LiveDeliverySessionOptions = {
  videoRef: RefObject<HTMLVideoElement | null>;
  source: string;
  enabled: boolean;
  sandbox?: boolean;
};

type DeliveryMetadata = Record<string, string | number | boolean | null>;

function detachVideo(video: HTMLVideoElement) {
  video.pause();
  video.preload = "none";
  video.removeAttribute("src");
  video.load();
}

function bufferAhead(video: HTMLVideoElement) {
  for (let index = 0; index < video.buffered.length; index += 1) {
    if (video.currentTime >= video.buffered.start(index) && video.currentTime <= video.buffered.end(index)) return Math.max(0, video.buffered.end(index) - video.currentTime);
  }
  return 0;
}

function publishDevDiagnostics() {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
  const snapshot = getLivePlaybackDiagnostics().getSnapshot();
  try {
    window.localStorage.setItem(LIVE_PLAYBACK_DIAGNOSTICS_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Diagnostics must never interfere with Live playback.
  }
}

export function useLiveDeliverySession({ videoRef, source, enabled, sandbox = false }: LiveDeliverySessionOptions) {
  const { consent, ready } = usePrivacyConsent();
  const diagnostics = getLivePlaybackDiagnostics();
  const analyticsReadyRef = useRef(false);
  const analyticsEnabledRef = useRef(false);
  const stateRef = useRef<LiveDeliveryState>("idle");
  const startedRef = useRef(false);
  const activeStartedAtRef = useRef<number | null>(null);
  const activeWatchMsRef = useRef(0);
  const suspendingRef = useRef(false);
  const routeExitSentRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const watchHeartbeatTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const pausedAtRef = useRef<number | null>(null);
  const hiddenAtRef = useRef<number | null>(null);
  const pauseSecondsRef = useRef(0);
  const hiddenSecondsRef = useRef(0);
  const hlsRef = useRef<Hls | null>(null);
  const hlsRecoveryCountRef = useRef(0);
  const fatalHlsRef = useRef(false);

  const updateState = useCallback((next: LiveDeliveryState) => {
    stateRef.current = next;
  }, []);

  useEffect(() => {
    analyticsReadyRef.current = ready;
    analyticsEnabledRef.current = consent.analytics;
  }, [consent.analytics, ready]);

  const track = useCallback((eventType: DeliveryEvent, metadata: DeliveryMetadata = {}) => {
    if (!analyticsReadyRef.current || !analyticsEnabledRef.current || typeof window === "undefined") return;
    const eventKey = `${sessionIdRef.current || "live"}:${eventType}:${Date.now()}`;
    const payload = JSON.stringify({
      eventType,
      eventKey,
      pagePath: window.location.pathname,
      contentType: "live_delivery",
      contentId: sessionIdRef.current,
      deviceType: window.matchMedia("(max-width: 680px)").matches ? "mobile" : window.matchMedia("(max-width: 1024px)").matches ? "tablet" : "desktop",
      environment: sandbox ? "sandbox" : "production",
      metadata
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics/events", new Blob([payload], { type: "application/json" }));
      diagnostics.apiRequest("/api/analytics/events", 0, true);
    } else {
      const startedAt = performance.now();
      void fetch("/api/analytics/events", { method: "POST", headers: { "content-type": "application/json" }, body: payload, keepalive: true })
        .then((response) => diagnostics.apiRequest("/api/analytics/events", performance.now() - startedAt, response.ok))
        .catch(() => diagnostics.apiRequest("/api/analytics/events", performance.now() - startedAt, false));
    }
  }, [diagnostics, sandbox]);

  const activeWatchSeconds = useCallback(() => {
    const current = activeStartedAtRef.current === null ? 0 : Math.max(0, Date.now() - activeStartedAtRef.current);
    return Math.floor((activeWatchMsRef.current + current) / 1000);
  }, []);

  const reportSession = useCallback((action: "start" | "heartbeat" | "pause" | "resume" | "stop" | "cutoff" | "tip", metadata: DeliveryMetadata = {}) => {
    if (!sessionIdRef.current || typeof window === "undefined") return;
    const payload = JSON.stringify({
      action,
      playbackSessionId: sessionIdRef.current,
      liveSessionId: "daily-live",
      activeWatchSeconds: activeWatchSeconds(),
      pauseSeconds: pauseSecondsRef.current,
      hiddenSeconds: hiddenSecondsRef.current,
      environment: sandbox ? "sandbox" : "production",
      ...metadata
    });
    const startedAt = performance.now();
    void fetch("/api/live/viewer-session", { method: "POST", headers: { "content-type": "application/json" }, body: payload, keepalive: true })
      .then((response) => diagnostics.apiRequest("/api/live/viewer-session", performance.now() - startedAt, response.ok))
      .catch(() => diagnostics.apiRequest("/api/live/viewer-session", performance.now() - startedAt, false));
  }, [activeWatchSeconds, diagnostics, sandbox]);

  const closeActiveWatch = useCallback(() => {
    if (activeStartedAtRef.current === null) return;
    activeWatchMsRef.current += Math.max(0, Date.now() - activeStartedAtRef.current);
    activeStartedAtRef.current = null;
  }, []);

  useEffect(() => {
    if (!sessionIdRef.current) {
      sessionIdRef.current = `live-delivery-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    const sourceType = source
      ? source.split(/[?#]/, 1)[0].toLowerCase().endsWith(".m3u8") ? "m3u8" : "other"
      : "none";
    const trace = (details: Record<string, string | number | boolean | null>) => {
      if (process.env.NODE_ENV === "production") return;
      const video = videoRef.current;
      console.info(`[live player] ${JSON.stringify({
        ...details,
        enabled,
        sourcePresent: Boolean(source),
        sourceType,
        videoRefPresent: Boolean(videoRef.current),
        visibilityState: typeof document === "undefined" ? null : document.visibilityState,
        nativeHlsResult: details.nativeHlsResult ?? (video?.canPlayType("application/vnd.apple.mpegurl") || null),
        hlsJsSupported: details.hlsJsSupported ?? Hls.isSupported(),
        videoErrorCode: video?.error?.code ?? null,
        readyState: video?.readyState ?? null,
        networkState: video?.networkState ?? null
      })}`);
    };
    trace({
      stage: "LIVE PLAYER INIT",
      selectedPlaybackMode: null,
      attachSourceCalled: false,
      srcAssigned: false,
      loadCalled: false,
      hlsMediaAttached: false,
      hlsLoadSourceCalled: false
    });
    if (!enabled || !source) {
      updateState("idle");
      return undefined;
    }

    const video = videoRef.current;
    if (!video) {
      trace({ stage: "LIVE PLAYER ERROR", reason: "VIDEO_REF_MISSING" });
      return undefined;
    }
    let disposed = false;
    routeExitSentRef.current = false;
    hlsRecoveryCountRef.current = 0;
    fatalHlsRef.current = false;
    video.preload = "none";
    let diagnosticsTimer: number | null = null;
    let nextDiagnosticsAt = performance.now() + 1000;
    diagnostics.startPlayer();

    const destroyHls = () => {
      if (!hlsRef.current) return;
      diagnostics.destroyHls();
      hlsRef.current.destroy();
      hlsRef.current = null;
      publishDevDiagnostics();
    };

    const fatalPlaybackError = () => {
      fatalHlsRef.current = true;
      video.dataset.playbackError = "HLS_FATAL_ERROR";
      trace({ stage: "LIVE PLAYER ERROR", reason: "HLS_FATAL_ERROR" });
      destroyHls();
      closeActiveWatch();
      reportSession("pause", { stopReason: "hls_fatal_error" });
      window.dispatchEvent(new CustomEvent("xmf:live-playback-state", { detail: { active: false, sessionId: sessionIdRef.current } }));
      track("live_playback_stop", { reason: "hls_fatal_error" });
      updateState("error");
      detachVideo(video);
    };

    const attachSource = () => {
      if (disposed || document.visibilityState === "hidden") return false;
      if (hlsRef.current || video.getAttribute("src") === source) {
        updateState("loading");
        return true;
      }
      const nativeHlsResult = video.canPlayType("application/vnd.apple.mpegurl");
      const hlsJsSupported = Hls.isSupported();
      let selectedPlaybackMode: "native-hls" | "hls-js" | "unsupported" = "unsupported";
      let srcAssigned = false;
      let loadCalled = false;
      let hlsMediaAttached = false;
      let hlsLoadSourceCalled = false;
      trace({
        stage: "LIVE PLAYER ATTACH START",
        nativeHlsResult: nativeHlsResult || null,
        hlsJsSupported,
        selectedPlaybackMode: null,
        attachSourceCalled: true,
        srcAssigned: false,
        loadCalled: false,
        hlsMediaAttached: false,
        hlsLoadSourceCalled: false
      });
      destroyHls();
      fatalHlsRef.current = false;
      if (nativeHlsResult) {
        selectedPlaybackMode = "native-hls";
        diagnostics.assignSource(source, selectedPlaybackMode);
        video.preload = "auto";
        video.setAttribute("src", source);
        srcAssigned = video.getAttribute("src") === source;
        video.load();
        loadCalled = true;
      } else if (hlsJsSupported) {
        selectedPlaybackMode = "hls-js";
        video.preload = "auto";
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 30,
          maxBufferLength: 20,
          maxMaxBufferLength: 40,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 6,
          capLevelToPlayerSize: true
        });
        hlsRef.current = hls;
        diagnostics.assignSource(source, selectedPlaybackMode);
        diagnostics.createHls();
        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          if (!disposed && hlsRef.current === hls) {
            hlsMediaAttached = true;
            diagnostics.mediaAttached();
            hls.loadSource(source);
            hlsLoadSourceCalled = true;
            diagnostics.sourceLoaded();
            trace({
              stage: "LIVE PLAYER HLS MEDIA_ATTACHED",
              nativeHlsResult: nativeHlsResult || null,
              hlsJsSupported,
              selectedPlaybackMode,
              attachSourceCalled: true,
              srcAssigned: false,
              loadCalled: false,
              hlsMediaAttached,
              hlsLoadSourceCalled
            });
          }
        });
        hls.on(Hls.Events.ERROR, (_event: string, data: { fatal: boolean; type: string }) => {
          diagnostics.hlsError(data.type, data.fatal);
          if (disposed || !data.fatal || hlsRef.current !== hls) return;
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && hlsRecoveryCountRef.current < 1) {
            hlsRecoveryCountRef.current += 1;
            diagnostics.recovery();
            hls.recoverMediaError();
            return;
          }
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && hlsRecoveryCountRef.current < 2) {
            hlsRecoveryCountRef.current += 1;
            diagnostics.recovery();
            hls.startLoad();
            return;
          }
          fatalPlaybackError();
        });
        hls.attachMedia(video);
      } else {
        video.dataset.playbackError = "UNSUPPORTED_HLS";
        trace({ stage: "LIVE PLAYER ERROR", reason: "UNSUPPORTED_HLS" });
        updateState("error");
      }
      trace({
        stage: "LIVE PLAYER ATTACH",
        nativeHlsResult: nativeHlsResult || null,
        hlsJsSupported,
        selectedPlaybackMode,
        attachSourceCalled: true,
        srcAssigned,
        loadCalled,
        hlsMediaAttached,
        hlsLoadSourceCalled
      });
      if (selectedPlaybackMode === "unsupported") return false;
      updateState("loading");
      return true;
    };

    const playVideo = () => {
      void video.play().catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          video.dataset.playbackError = "AUTOPLAY_BLOCKED";
          trace({ stage: "LIVE PLAYER AUTOPLAY", reason: "AUTOPLAY_BLOCKED" });
        }
        updateState("paused");
      });
    };

    const onPlay = () => {
      diagnostics.videoEvent("play");
      retryCountRef.current = 0;
      if (!startedRef.current) {
        startedRef.current = true;
        track("live_playback_start", { sourceAttached: true });
        reportSession("start");
      } else {
        if (pausedAtRef.current !== null) {
          pauseSecondsRef.current += Math.floor((Date.now() - pausedAtRef.current) / 1000);
          pausedAtRef.current = null;
        }
        if (hiddenAtRef.current !== null) {
          hiddenSecondsRef.current += Math.floor((Date.now() - hiddenAtRef.current) / 1000);
          hiddenAtRef.current = null;
        }
        reportSession("resume");
      }
      if (activeStartedAtRef.current === null) activeStartedAtRef.current = Date.now();
      updateState("playing");
      window.dispatchEvent(new CustomEvent("xmf:live-playback-state", { detail: { active: true, sessionId: sessionIdRef.current } }));
      if (watchHeartbeatTimerRef.current === null) {
        watchHeartbeatTimerRef.current = window.setInterval(() => reportSession("heartbeat"), 30_000);
      }
    };
    const onPlaying = () => {
      diagnostics.videoEvent("playing");
      updateState("playing");
    };
    const onPause = () => {
      diagnostics.videoEvent("pause");
      if (fatalHlsRef.current) return;
      closeActiveWatch();
      reportSession("pause");
      if (!suspendingRef.current && pausedAtRef.current === null) pausedAtRef.current = Date.now();
      window.dispatchEvent(new CustomEvent("xmf:live-playback-state", { detail: { active: false, sessionId: sessionIdRef.current } }));
      if (watchHeartbeatTimerRef.current !== null) {
        window.clearInterval(watchHeartbeatTimerRef.current);
        watchHeartbeatTimerRef.current = null;
      }
      if (!suspendingRef.current) {
        track("live_playback_stop", { reason: "paused" });
        updateState("paused");
      }
    };
    const onError = () => {
      if (fatalHlsRef.current) return;
      diagnostics.videoEvent("error");
      video.dataset.playbackError = "VIDEO_ERROR";
      trace({ stage: "LIVE PLAYER ERROR", reason: "VIDEO_ERROR" });
      updateState("error");
      destroyHls();
      closeActiveWatch();
      window.dispatchEvent(new CustomEvent("xmf:live-playback-state", { detail: { active: false, sessionId: sessionIdRef.current } }));
      if (disposed || suspendingRef.current || document.visibilityState === "hidden" || retryCountRef.current >= 2) {
        destroyHls();
        detachVideo(video);
        return;
      }
      retryCountRef.current += 1;
      const retryDelay = 1000 * (2 ** (retryCountRef.current - 1));
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        if (disposed || document.visibilityState === "hidden") return;
        destroyHls();
        detachVideo(video);
        if (attachSource()) playVideo();
      }, retryDelay);
    };
    const onEnded = () => {
      diagnostics.videoEvent("ended");
      destroyHls();
      closeActiveWatch();
      reportSession("stop", { stopReason: "ended" });
      window.dispatchEvent(new CustomEvent("xmf:live-playback-state", { detail: { active: false, sessionId: sessionIdRef.current } }));
      track("live_playback_stop", { reason: "ended" });
      updateState("destroyed");
    };
    const onTipConfirmed = (event: Event) => {
      const detail = (event as CustomEvent<{ transactionId?: string; tokenAmount?: number }>).detail || {};
      reportSession("tip", { transactionReference: detail.transactionId || null, coinsTipped: detail.tokenAmount || 0 });
    };
    const onUnpaidCutoff = () => {
      if (disposed || !startedRef.current) return;
      closeActiveWatch();
      reportSession("cutoff", { stopReason: "unpaid_contribution_cutoff" });
      track("live_unpaid_cutoff", { activeWatchSeconds: activeWatchSeconds() });
      window.dispatchEvent(new CustomEvent("xmf:live-playback-state", { detail: { active: false, sessionId: sessionIdRef.current } }));
      if (watchHeartbeatTimerRef.current !== null) {
        window.clearInterval(watchHeartbeatTimerRef.current);
        watchHeartbeatTimerRef.current = null;
      }
      updateState("destroying");
      destroyHls();
      detachVideo(video);
      updateState("destroyed");
    };
    const onViewingCreditEmpty = () => {
      if (disposed || !startedRef.current) return;
      closeActiveWatch();
      reportSession("cutoff", { stopReason: "hourly_viewing_credit_empty" });
      track("live_viewing_credit_empty", { activeWatchSeconds: activeWatchSeconds() });
      window.dispatchEvent(new CustomEvent("xmf:live-playback-state", { detail: { active: false, sessionId: sessionIdRef.current } }));
      if (watchHeartbeatTimerRef.current !== null) {
        window.clearInterval(watchHeartbeatTimerRef.current);
        watchHeartbeatTimerRef.current = null;
      }
      updateState("destroying");
      destroyHls();
      detachVideo(video);
      updateState("destroyed");
    };
    const onViewingCreditRestored = () => {
      if (disposed || document.visibilityState === "hidden" || !source) return;
      if (!attachSource()) return;
      track("live_viewing_credit_resume");
      playVideo();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        const wasPlaying = startedRef.current && !video.paused;
        if (!wasPlaying) return;
        suspendingRef.current = true;
        closeActiveWatch();
        if (hiddenAtRef.current === null) hiddenAtRef.current = Date.now();
        reportSession("pause", { stopReason: "background" });
        window.dispatchEvent(new CustomEvent("xmf:live-playback-state", { detail: { active: false, sessionId: sessionIdRef.current } }));
        if (watchHeartbeatTimerRef.current !== null) {
          window.clearInterval(watchHeartbeatTimerRef.current);
          watchHeartbeatTimerRef.current = null;
        }
        track("live_background_pause", { activeWatchSeconds: Math.floor(activeWatchMsRef.current / 1000) });
        updateState("destroying");
        destroyHls();
        detachVideo(video);
        suspendingRef.current = false;
        updateState("paused");
        return;
      }
      if (!startedRef.current || video.getAttribute("src")) return;
      nextDiagnosticsAt = performance.now() + 1000;
      if (hiddenAtRef.current !== null) {
        hiddenSecondsRef.current += Math.floor((Date.now() - hiddenAtRef.current) / 1000);
        hiddenAtRef.current = null;
      }
      if (!attachSource()) return;
      track("live_playback_resume");
      reportSession("resume");
      playVideo();
    };
    const onVideoStall = (event: Event) => {
      diagnostics.videoEvent(event.type);
      publishDevDiagnostics();
    };
    const sampleDiagnostics = () => {
      const now = performance.now();
      if (document.hidden) {
        nextDiagnosticsAt = now + 1000;
        return;
      }
      diagnostics.timerSample(now - nextDiagnosticsAt + 1000);
      nextDiagnosticsAt += 1000;
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
      publishDevDiagnostics();
    };
    const onPageExit = () => {
      if (routeExitSentRef.current) return;
      routeExitSentRef.current = true;
      closeActiveWatch();
      if (startedRef.current) {
        track("live_route_exit_stop", { activeWatchSeconds: Math.floor(activeWatchMsRef.current / 1000) });
        track("live_active_watch", { activeWatchSeconds: Math.floor(activeWatchMsRef.current / 1000) });
        reportSession("stop", { stopReason: "route_exit", routeExit: true });
      } else {
        track("live_video_never_started");
      }
      updateState("destroying");
      destroyHls();
      detachVideo(video);
      updateState("destroyed");
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("error", onError);
    video.addEventListener("ended", onEnded);
    ["waiting", "stalled", "seeking"].forEach((event) => video.addEventListener(event, onVideoStall));
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageExit);
    window.addEventListener("beforeunload", onPageExit);
    window.addEventListener("xmf:tip-confirmed", onTipConfirmed);
    window.addEventListener("xmf:live-unpaid-cutoff", onUnpaidCutoff);
    window.addEventListener("xmf:live-viewing-credit-empty", onViewingCreditEmpty);
    window.addEventListener("xmf:live-credit-restored", onViewingCreditRestored);
    track("live_page_visit", { sourceAvailable: true });
    trace({
      stage: "LIVE PLAYER READY",
      nativeHlsResult: video.canPlayType("application/vnd.apple.mpegurl") || null,
      hlsJsSupported: Hls.isSupported(),
      selectedPlaybackMode: null,
      attachSourceCalled: false,
      srcAssigned: video.getAttribute("src") === source,
      loadCalled: false,
      hlsMediaAttached: Boolean(hlsRef.current),
      hlsLoadSourceCalled: false
    });
    attachSource();
    if (document.visibilityState === "visible") playVideo();
    diagnosticsTimer = window.setInterval(sampleDiagnostics, 1000);
    publishDevDiagnostics();

    return () => {
      disposed = true;
      video.removeEventListener("play", onPlay);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("error", onError);
      video.removeEventListener("ended", onEnded);
      ["waiting", "stalled", "seeking"].forEach((event) => video.removeEventListener(event, onVideoStall));
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageExit);
      window.removeEventListener("beforeunload", onPageExit);
      window.removeEventListener("xmf:tip-confirmed", onTipConfirmed);
      window.removeEventListener("xmf:live-unpaid-cutoff", onUnpaidCutoff);
      window.removeEventListener("xmf:live-viewing-credit-empty", onViewingCreditEmpty);
      window.removeEventListener("xmf:live-credit-restored", onViewingCreditRestored);
      if (watchHeartbeatTimerRef.current !== null) {
        window.clearInterval(watchHeartbeatTimerRef.current);
        watchHeartbeatTimerRef.current = null;
      }
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (!routeExitSentRef.current) onPageExit();
      destroyHls();
      closeActiveWatch();
      if (diagnosticsTimer !== null) window.clearInterval(diagnosticsTimer);
      diagnostics.stopPlayer();
      publishDevDiagnostics();
    };
  }, [closeActiveWatch, diagnostics, enabled, source, track, updateState, videoRef]);

  return { stateRef };
}
