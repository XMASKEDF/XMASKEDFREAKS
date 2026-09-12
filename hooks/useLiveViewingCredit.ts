"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getLivePlaybackDiagnostics } from "@/lib/live/playback-diagnostics";
import {
  creditHalfSecondsToSeconds,
  creditWarningLevel,
  formatViewingCredit,
  isGraceActive,
  type ViewingCreditSnapshot
} from "@/lib/live/viewing-credit";

type CreditResponse = {
  ok?: boolean;
  configured?: boolean;
  snapshot?: (ViewingCreditSnapshot & { zero?: boolean }) | null;
};

type LiveViewingCreditOptions = { enabled: boolean; sandbox?: boolean };

export function useLiveViewingCredit({ enabled, sandbox = false }: LiveViewingCreditOptions) {
  const diagnostics = getLivePlaybackDiagnostics();
  const [snapshot, setSnapshot] = useState<ViewingCreditSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [deliveryPaused, setDeliveryPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState<"entry" | "hourly" | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const activeRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const visibleHalfSecondsRef = useRef(0);
  const lastSyncAtRef = useRef(0);
  const emptyEventRef = useRef(false);
  const lastWarningRef = useRef<string | null>(null);

  const applySnapshot = useCallback((next: ViewingCreditSnapshot | null) => {
    if (!next) return;
    visibleHalfSecondsRef.current = Math.max(0, Math.floor(next.creditHalfSeconds || 0));
    setSnapshot(next);
    setNow(Date.now());
  }, []);

  const read = useCallback(async () => {
    const startedAt = performance.now();
    const response = await fetch(`/api/live/viewing-credit?environment=${sandbox ? "sandbox" : "production"}`, { cache: "no-store" }).catch(() => null);
    diagnostics.apiRequest("/api/live/viewing-credit", performance.now() - startedAt, Boolean(response?.ok));
    const result = await response?.json().catch(() => ({})) as CreditResponse;
    if (!response?.ok || !result.snapshot) {
      setReady(true);
      return;
    }
    applySnapshot(result.snapshot);
    setReady(true);
  }, [applySnapshot, diagnostics, sandbox]);

  const sync = useCallback(async (active: boolean) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    const startedAt = performance.now();
    const response = await fetch("/api/live/viewing-credit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playbackSessionId: sessionId, active, environment: sandbox ? "sandbox" : "production" }),
      keepalive: true
    }).catch(() => null);
    diagnostics.apiRequest("/api/live/viewing-credit", performance.now() - startedAt, Boolean(response?.ok));
    const result = await response?.json().catch(() => ({})) as CreditResponse;
    if (result.snapshot) {
      applySnapshot(result.snapshot);
      if (result.snapshot.zero && result.snapshot.entryRequirementSatisfied && active && !isGraceActive(result.snapshot.graceExpiresAt)) {
        emptyEventRef.current = true;
        setPauseReason("hourly");
        setDeliveryPaused(true);
        window.dispatchEvent(new CustomEvent("xmf:live-viewing-credit-empty"));
      }
    }
    lastSyncAtRef.current = Date.now();
  }, [applySnapshot, diagnostics, sandbox]);

  useEffect(() => {
    if (!enabled) return undefined;
    void read();
    const refresh = window.setInterval(() => void read(), 60_000);
    return () => window.clearInterval(refresh);
  }, [enabled, read]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onPlaybackState = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean; sessionId?: string }>).detail || {};
      activeRef.current = detail.active === true;
      if (detail.sessionId) sessionIdRef.current = detail.sessionId;
      if (activeRef.current) void sync(true);
      else void sync(false);
    };
    const onCutoff = () => {
      setPauseReason("entry");
      setDeliveryPaused(true);
      emptyEventRef.current = false;
    };
    const onTipConfirmed = (event: Event) => {
      const detail = (event as CustomEvent<{ viewingCredit?: ViewingCreditSnapshot | null }>).detail || {};
      if (!detail.viewingCredit) return;
      applySnapshot(detail.viewingCredit);
      const canResume = detail.viewingCredit.entryRequirementSatisfied &&
        (detail.viewingCredit.creditHalfSeconds > 0 || isGraceActive(detail.viewingCredit.graceExpiresAt));
      if (canResume) {
        setPauseReason(null);
        setDeliveryPaused(false);
        emptyEventRef.current = false;
        window.dispatchEvent(new CustomEvent("xmf:live-credit-restored"));
      }
    };
    window.addEventListener("xmf:live-playback-state", onPlaybackState);
    window.addEventListener("xmf:live-unpaid-cutoff", onCutoff);
    window.addEventListener("xmf:tip-confirmed", onTipConfirmed);
    return () => {
      window.removeEventListener("xmf:live-playback-state", onPlaybackState);
      window.removeEventListener("xmf:live-unpaid-cutoff", onCutoff);
      window.removeEventListener("xmf:tip-confirmed", onTipConfirmed);
    };
  }, [applySnapshot, enabled, sync]);

  useEffect(() => {
    if (!enabled) return undefined;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (!activeRef.current || deliveryPaused || !snapshot || !snapshot.entryRequirementSatisfied || isGraceActive(snapshot.graceExpiresAt)) return;
      visibleHalfSecondsRef.current = Math.max(0, visibleHalfSecondsRef.current - 2);
      const nextHalfSeconds = visibleHalfSecondsRef.current;
      if (nextHalfSeconds === 0 && !emptyEventRef.current) {
        emptyEventRef.current = true;
        setPauseReason("hourly");
        setDeliveryPaused(true);
        window.dispatchEvent(new CustomEvent("xmf:live-viewing-credit-empty"));
      }
      if (Date.now() - lastSyncAtRef.current >= 15_000) void sync(true);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [deliveryPaused, enabled, snapshot, sync]);

  useEffect(() => {
    const onRestored = () => {
      setPauseReason(null);
      setDeliveryPaused(false);
    };
    window.addEventListener("xmf:live-credit-restored", onRestored);
    return () => window.removeEventListener("xmf:live-credit-restored", onRestored);
  }, []);

  const visibleHalfSeconds = visibleHalfSecondsRef.current;
  const grace = isGraceActive(snapshot?.graceExpiresAt || null, now);
  const warning = creditWarningLevel(visibleHalfSeconds, snapshot?.graceExpiresAt || null, now);
  const remainingSeconds = creditHalfSecondsToSeconds(visibleHalfSeconds);
  useEffect(() => {
    if (!enabled) return;
    if (warning === "healthy" || warning === "grace") {
      lastWarningRef.current = null;
      return;
    }
    if (warning !== "reminder" && warning !== "final") return;
    if (lastWarningRef.current === warning) return;
    lastWarningRef.current = warning;
    window.dispatchEvent(new CustomEvent("xmf:live-hourly-credit-reminder", {
      detail: { warning, remainingSeconds }
    }));
  }, [enabled, remainingSeconds, warning]);
  return {
    snapshot,
    ready,
    deliveryPaused,
    remainingSeconds,
    remainingLabel: formatViewingCredit(visibleHalfSeconds),
    warning,
    timerVisible: Boolean(snapshot?.entryRequirementSatisfied) && !grace && remainingSeconds <= 120 && remainingSeconds > 0,
    graceActive: grace,
    pauseReason
  };
}
