"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getLivePlaybackDiagnostics } from "@/lib/live/playback-diagnostics";

type PresenceResponse = {
  realLiveViewerCount: number;
  publicViewerDisplayValue: number;
  entryDelta: number;
  leaveDelta: number;
  broadcastId: string;
};

const emptyPresence: PresenceResponse = {
  realLiveViewerCount: 0,
  publicViewerDisplayValue: 0,
  entryDelta: 0,
  leaveDelta: 0,
  broadcastId: ""
};

function randomId(prefix: string) {
  const uuid = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}-${uuid}`;
}

function getIdentity() {
  const visitorKey = localStorage.getItem("xmf-live-visitor-key") || randomId("visitor");
  localStorage.setItem("xmf-live-visitor-key", visitorKey);
  const tabId = sessionStorage.getItem("xmf-live-tab-key") || randomId("tab");
  sessionStorage.setItem("xmf-live-tab-key", tabId);
  return { visitorKey, tabId };
}

export function useLiveViewerPresence(active: boolean) {
  const diagnostics = getLivePlaybackDiagnostics();
  const identityRef = useRef<{ visitorKey: string; tabId: string } | null>(null);
  const mountedRef = useRef(true);
  const [presence, setPresence] = useState<PresenceResponse>(emptyPresence);
  const [joinEventId, setJoinEventId] = useState(0);

  const sendPresence = useCallback(async (action: "join" | "heartbeat" | "leave", keepalive = false) => {
    if (!identityRef.current) return;
    const startedAt = performance.now();
    const response = await fetch("/api/live/presence", {
      method: "POST",
      keepalive,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...identityRef.current, action })
    }).catch(() => null);
    diagnostics.apiRequest("/api/live/presence", performance.now() - startedAt, Boolean(response?.ok));
    if (!response?.ok || action === "leave" || !mountedRef.current) return;
    const next = await response.json().catch(() => null) as PresenceResponse | null;
    if (!next) return;
    setPresence(next);
    if (next.entryDelta > 0) setJoinEventId((value) => value + 1);
  }, [diagnostics]);

  useEffect(() => {
    mountedRef.current = true;
    if (!active) return () => undefined;
    identityRef.current = getIdentity();
    void sendPresence("join");
    const heartbeat = window.setInterval(() => void sendPresence("heartbeat"), 15_000);
    return () => {
      window.clearInterval(heartbeat);
      void sendPresence("leave", true);
    };
  }, [active, sendPresence]);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  return { ...presence, joinEventId };
}
