"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getLivePlaybackDiagnostics } from "@/lib/live/playback-diagnostics";

export type StreamPlaybackStatus =
  | "idle"
  | "loading"
  | "connecting"
  | "buffering"
  | "starting"
  | "live"
  | "paused"
  | "offline"
  | "waiting"
  | "ended"
  | "error";

export type StreamPlaybackEventHandlers = {
  onLoadStart: () => void;
  onLoadedMetadata: () => void;
  onCanPlay: () => void;
  onPlay: () => void;
  onPlaying: () => void;
  onWaiting: () => void;
  onStalled: () => void;
  onSeeking: () => void;
  onPause: () => void;
  onEnded: () => void;
  onError: () => void;
  onEmptied: () => void;
  onAbort: () => void;
};

const BRAND_VISIBLE_STATUSES = new Set<StreamPlaybackStatus>(["idle", "offline", "waiting", "ended", "error"]);

export function shouldShowIdleBranding(status: StreamPlaybackStatus) {
  return BRAND_VISIBLE_STATUSES.has(status);
}

export function useStreamPlaybackStatus(hasVideoSource: boolean) {
  const diagnostics = getLivePlaybackDiagnostics();
  const [status, setStatus] = useState<StreamPlaybackStatus>(hasVideoSource ? "idle" : "offline");

  const updateStatus = useCallback((nextStatus: StreamPlaybackStatus) => {
    setStatus((currentStatus) => (currentStatus === nextStatus ? currentStatus : nextStatus));
  }, []);

  const videoEvents = useMemo(() => ({
    onLoadStart: () => updateStatus(hasVideoSource ? "loading" : "offline"),
    onLoadedMetadata: () => updateStatus(hasVideoSource ? "connecting" : "offline"),
    onCanPlay: () => updateStatus(hasVideoSource ? "starting" : "offline"),
    onPlay: () => updateStatus("starting"),
    onPlaying: () => updateStatus("live"),
    onWaiting: () => updateStatus(hasVideoSource ? "buffering" : "waiting"),
    onStalled: () => updateStatus(hasVideoSource ? "buffering" : "waiting"),
    onSeeking: () => updateStatus(hasVideoSource ? "buffering" : "waiting"),
    onPause: () => updateStatus(hasVideoSource ? "paused" : "waiting"),
    onEnded: () => updateStatus("ended"),
    onError: () => updateStatus("error"),
    onEmptied: () => updateStatus("offline"),
    onAbort: () => updateStatus(hasVideoSource ? "waiting" : "offline")
  }), [hasVideoSource, updateStatus]);

  useEffect(() => {
    if (!hasVideoSource) {
      updateStatus("offline");
    }
  }, [hasVideoSource, updateStatus]);

  useEffect(() => {
    diagnostics.streamStatus(status);
    window.dispatchEvent(new CustomEvent("xmf:stream-playback", { detail: { status } }));
  }, [diagnostics, status]);

  return {
    status,
    showIdleBranding: shouldShowIdleBranding(status),
    setStreamPlaybackStatus: updateStatus,
    videoEvents
  };
}
