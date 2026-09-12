"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { DEFAULT_CONTRIBUTION_SETTINGS, type ContributionPeriodSnapshot } from "@/lib/contribution-policy";
import { estimateActiveWatchSeconds, nextContributionClockThreshold } from "@/lib/live/contribution-clock";
import LiveTipReminder, { type LiveTipReminderState } from "@/components/LiveTipReminder";

type AccessResponse = ContributionPeriodSnapshot & {
  ok: boolean;
  requiredCoins: number;
  minimumPayment: number;
  reminderDurationSeconds: number;
  clips4SaleUrl: string | null;
  reminderStage: "first" | "second" | null;
  unpaidPlaybackStopped: boolean;
};

const leaderKey = "xmf-contribution-heartbeat-leader";

function eventId(tabId: string, type: string) {
  return `${tabId}:${type}:${Date.now()}:${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
}

export default function ContributionActivityTracker() {
  const pathname = usePathname();
  const { locale, t } = useI18n();
  const tabIdRef = useRef(`tab-${Math.random().toString(36).slice(2)}-${Date.now()}`);
  const pageLoadIdRef = useRef(crypto.randomUUID?.() || `load-${Date.now()}-${Math.random()}`);
  const [snapshot, setSnapshot] = useState<AccessResponse | null>(null);
  const [reminderState, setReminderState] = useState<LiveTipReminderState | "closed">("closed");
  const [leader, setLeader] = useState(false);
  const leaderRef = useRef(false);
  const reminderTimerRef = useRef<number | null>(null);
  const reminderDeadlineRef = useRef(0);
  const snapshotRef = useRef<AccessResponse | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const restrictedAttemptRecordedRef = useRef(false);
  const lastMeaningfulActivityRef = useRef(0);
  const mediaActiveRef = useRef(false);
  const reminderStageRef = useRef<"first" | "second">("first");
  const cutoffDispatchedPeriodRef = useRef<string | null>(null);
  const mediaHeartbeatTimerRef = useRef<number | null>(null);
  const cutoffRedirectTimerRef = useRef<number | null>(null);
  const cutoffStartedAtRef = useRef<number | null>(null);
  const paymentInProgressRef = useRef(false);
  const redirectStartedRef = useRef(false);
  const hourlyReminderRef = useRef(false);
  const activeWatchClockBaseRef = useRef(0);
  const activeWatchStartedAtRef = useRef<number | null>(null);
  const contributionClockTimerRef = useRef<number | null>(null);
  const firstReminderDisplayedRef = useRef(false);
  const firstReminderDismissedRef = useRef(false);
  const secondReminderDisplayedRef = useRef(false);
  const secondReminderDismissedRef = useRef(false);
  const reminderOpen = reminderState !== "closed";
  leaderRef.current = leader;

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    try {
      const client = createSupabaseBrowserClient();
      const { data } = await client.auth.getSession();
      return data.session?.access_token ? { authorization: `Bearer ${data.session.access_token}` } : {};
    } catch {
      return {};
    }
  }, []);

  const estimatedWatchSeconds = useCallback((nowMs = Date.now()) => {
    return estimateActiveWatchSeconds(activeWatchClockBaseRef.current, activeWatchStartedAtRef.current, nowMs);
  }, []);

  const reconcileWatchClock = useCallback((next: AccessResponse) => {
    const previous = snapshotRef.current;
    const localEstimate = previous?.periodId === next.periodId ? estimatedWatchSeconds() : 0;
    activeWatchClockBaseRef.current = Math.max(0, Number(next.activeWatchSeconds) || 0, localEstimate);
    activeWatchStartedAtRef.current = mediaActiveRef.current && document.visibilityState === "visible" ? Date.now() : null;
  }, [estimatedWatchSeconds]);

  const clearContributionClock = useCallback(() => {
    if (contributionClockTimerRef.current !== null) window.clearTimeout(contributionClockTimerRef.current);
    contributionClockTimerRef.current = null;
  }, []);

  const clockProgress = useCallback((current: AccessResponse) => {
    const secondReminderFinished = !current.reminderDue && current.reminderDisplayed && current.reminderDismissed
      && current.activeWatchSeconds >= DEFAULT_CONTRIBUTION_SETTINGS.secondReminderAtSeconds;
    return {
      activeWatchSeconds: current.activeWatchSeconds,
      firstReminderDisplayed: firstReminderDisplayedRef.current || current.reminderDisplayed,
      firstReminderDismissed: firstReminderDismissedRef.current || current.reminderDismissed,
      secondReminderDisplayed: secondReminderDisplayedRef.current || secondReminderFinished,
      secondReminderDismissed: secondReminderDismissedRef.current || secondReminderFinished,
      requirementSatisfied: current.requirementSatisfied,
      exempt: current.exempt,
      checkoutProtected: current.checkoutProtected,
      unpaidPlaybackStopped: current.unpaidPlaybackStopped
    };
  }, []);

  const transition = useCallback(async (action: string, activityType = action) => {
    const headers = await authHeaders();
    const response = await fetch("/api/access-control", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({
        action, route: pathname || "/", visible: document.visibilityState === "visible",
        mediaActive: mediaActiveRef.current, reminderStage: reminderStageRef.current,
        activityType, locale, pageLoadId: pageLoadIdRef.current,
        eventKey: eventId(tabIdRef.current, action)
      })
    }).catch(() => null);
    if (!response?.ok) return null;
    const next = await response.json() as AccessResponse;
    reconcileWatchClock(next);
    snapshotRef.current = next;
    setSnapshot(next);
    channelRef.current?.postMessage({ type: "snapshot", snapshot: next });
    window.dispatchEvent(new CustomEvent("xmf:contribution-state", { detail: { ...next, ready: true } }));
    return next;
  }, [authHeaders, locale, pathname, reconcileWatchClock]);

  const scheduleContributionClock = useCallback(() => {
    clearContributionClock();
    if (!leaderRef.current || !pathname.startsWith("/live") || !mediaActiveRef.current || document.visibilityState === "hidden") return;
    const current = snapshotRef.current;
    if (!current) return;
    const target = nextContributionClockThreshold(clockProgress(current));
    if (target === null) return;
    const remainingMs = Math.max(0, (target - estimatedWatchSeconds()) * 1000);
    contributionClockTimerRef.current = window.setTimeout(() => {
      contributionClockTimerRef.current = null;
      const latest = snapshotRef.current;
      if (!latest || !leaderRef.current || !mediaActiveRef.current || document.visibilityState === "hidden") return;
      const nextTarget = nextContributionClockThreshold(clockProgress(latest));
      if (nextTarget === null) return;
      if (estimatedWatchSeconds() < nextTarget) {
        scheduleContributionClock();
        return;
      }
      void transition("status", "live_watch_threshold").then(() => scheduleContributionClock());
    }, remainingMs);
  }, [clearContributionClock, clockProgress, estimatedWatchSeconds, pathname, transition]);

  const closeReminder = useCallback(async (reason: "manual" | "expired") => {
    if (reminderTimerRef.current) window.clearTimeout(reminderTimerRef.current);
    reminderTimerRef.current = null;
    reminderDeadlineRef.current = 0;
    hourlyReminderRef.current = false;
    if (reminderStageRef.current === "second") secondReminderDismissedRef.current = true;
    else firstReminderDismissedRef.current = true;
    setReminderState("closed");
    channelRef.current?.postMessage({ type: "reminder-closed" });
    await transition(reason === "manual" ? "reminder_manual_close" : "reminder_auto_expired");
  }, [transition]);

  const dismissReminder = useCallback(() => {
    if (reminderTimerRef.current) window.clearTimeout(reminderTimerRef.current);
    reminderTimerRef.current = null;
    reminderDeadlineRef.current = 0;
    hourlyReminderRef.current = false;
    if (reminderStageRef.current === "second") secondReminderDismissedRef.current = true;
    else firstReminderDismissedRef.current = true;
    setReminderState("closed");
    channelRef.current?.postMessage({ type: "reminder-closed" });
    void transition("reminder_manual_close");
  }, [transition]);

  const trackReminderAnalytics = useCallback((eventType: string, stage: "first" | "second") => {
    const payload = JSON.stringify({
      eventType,
      eventKey: `live-contribution:${snapshotRef.current?.periodId || "unknown"}:${stage}:${eventType}:${Date.now()}`,
      pagePath: window.location.pathname,
      contentType: "live_contribution",
      contentId: snapshotRef.current?.periodId || null,
      deviceType: window.matchMedia("(max-width: 680px)").matches ? "mobile" : "desktop",
      metadata: { stage, activeWatchSeconds: snapshotRef.current?.activeWatchSeconds || 0 }
    });
    void fetch("/api/analytics/events", { method: "POST", headers: { "content-type": "application/json" }, body: payload, keepalive: true }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const channel = "BroadcastChannel" in window ? new BroadcastChannel("xmf-contribution-rule") : null;
    channelRef.current = channel;
    channel?.addEventListener("message", (event) => {
      if (event.data?.type === "snapshot") {
        const next = event.data.snapshot as AccessResponse;
        reconcileWatchClock(next);
        snapshotRef.current = next;
        setSnapshot(next);
      }
      if (event.data?.type === "reminder-open") {
        const stage = event.data.stage === "second" ? "second" : "first";
        reminderStageRef.current = stage;
        if (stage === "second") secondReminderDisplayedRef.current = true;
        else firstReminderDisplayedRef.current = true;
        setReminderState("due");
      }
      if (event.data?.type === "reminder-closed") {
        if (reminderStageRef.current === "second") secondReminderDismissedRef.current = true;
        else firstReminderDismissedRef.current = true;
        setReminderState("closed");
      }
    });
    return () => { channel?.close(); channelRef.current = null; };
  }, [reconcileWatchClock]);

  useEffect(() => {
    const tabId = tabIdRef.current;
    const claim = () => {
      const now = Date.now();
      let current: { id?: string; expiresAt?: number } = {};
      try { current = JSON.parse(localStorage.getItem(leaderKey) || "{}") as typeof current; } catch {}
      if (!current.id || Number(current.expiresAt || 0) <= now || current.id === tabId) {
        localStorage.setItem(leaderKey, JSON.stringify({ id: tabId, expiresAt: now + 45_000 }));
        setLeader(true);
      } else setLeader(false);
    };
    claim();
    const timer = window.setInterval(claim, 15_000);
    return () => {
      window.clearInterval(timer);
      try {
        const current = JSON.parse(localStorage.getItem(leaderKey) || "{}") as { id?: string };
        if (current.id === tabId) localStorage.removeItem(leaderKey);
      } catch {}
    };
  }, []);

  useEffect(() => {
    if (!leader) return;
    void transition("activity", pathname.startsWith("/live") ? "live_watch" : "page_view");
    const timer = window.setInterval(() => void transition("status", "heartbeat"), 30_000);
    return () => window.clearInterval(timer);
  }, [leader, pathname, transition]);

  useEffect(() => {
    const onPlaybackState = (event: Event) => {
      const active = (event as CustomEvent<{ active?: boolean }>).detail?.active === true;
      mediaActiveRef.current = active;
      if (active) {
        if (activeWatchStartedAtRef.current === null) activeWatchStartedAtRef.current = Date.now();
      } else {
        activeWatchClockBaseRef.current = estimatedWatchSeconds();
        activeWatchStartedAtRef.current = null;
      }
      if (active && pathname.startsWith("/live") && mediaHeartbeatTimerRef.current === null) {
        mediaHeartbeatTimerRef.current = window.setInterval(() => void transition("status", "live_active_watch"), 5_000);
      }
      if (!active && mediaHeartbeatTimerRef.current !== null) {
        window.clearInterval(mediaHeartbeatTimerRef.current);
        mediaHeartbeatTimerRef.current = null;
      }
      if (!leaderRef.current || !pathname.startsWith("/live")) {
        clearContributionClock();
        return;
      }
      void transition("status", active ? "live_playback_active" : "live_playback_inactive");
      if (active) scheduleContributionClock();
      else clearContributionClock();
    };
    window.addEventListener("xmf:live-playback-state", onPlaybackState);
    return () => {
      window.removeEventListener("xmf:live-playback-state", onPlaybackState);
      if (mediaHeartbeatTimerRef.current !== null) window.clearInterval(mediaHeartbeatTimerRef.current);
      mediaHeartbeatTimerRef.current = null;
      mediaActiveRef.current = false;
      activeWatchClockBaseRef.current = estimatedWatchSeconds();
      activeWatchStartedAtRef.current = null;
    };
  }, [clearContributionClock, estimatedWatchSeconds, pathname, scheduleContributionClock, transition]);

  useEffect(() => {
    scheduleContributionClock();
    return clearContributionClock;
  }, [clearContributionClock, leader, pathname, scheduleContributionClock, snapshot?.activeWatchSeconds, snapshot?.checkoutProtected, snapshot?.exempt, snapshot?.periodId, snapshot?.reminderDisplayed, snapshot?.reminderDismissed, snapshot?.reminderStage, snapshot?.requirementSatisfied, snapshot?.unpaidPlaybackStopped]);

  useEffect(() => {
    const recordInteraction = () => {
      const now = Date.now();
      if (!leader || now - lastMeaningfulActivityRef.current < 10_000) return;
      lastMeaningfulActivityRef.current = now;
      void transition("activity", pathname.startsWith("/live") ? "live_interaction" : "browsing_interaction");
    };
    document.addEventListener("click", recordInteraction, { passive: true });
    document.addEventListener("keydown", recordInteraction);
    return () => {
      document.removeEventListener("click", recordInteraction);
      document.removeEventListener("keydown", recordInteraction);
    };
  }, [leader, pathname, transition]);

  useEffect(() => {
    if (!pathname.startsWith("/live") || !snapshot?.restricted) restrictedAttemptRecordedRef.current = false;
  }, [pathname, snapshot?.restricted]);

  useEffect(() => {
    if (pathname.startsWith("/live") || !reminderOpen) return;
    if (reminderTimerRef.current) window.clearTimeout(reminderTimerRef.current);
    reminderTimerRef.current = null;
    reminderDeadlineRef.current = 0;
    setReminderState("closed");
    mediaActiveRef.current = false;
    channelRef.current?.postMessage({ type: "reminder-closed" });
  }, [pathname, reminderOpen]);

  useEffect(() => {
    if (!leader || !pathname.startsWith("/live") || !snapshot?.restricted || restrictedAttemptRecordedRef.current) return;
    restrictedAttemptRecordedRef.current = true;
    void transition("restricted_access_attempt");
  }, [leader, pathname, snapshot?.restricted, transition]);

  useEffect(() => {
    if (!pathname.startsWith("/live") || !snapshot?.restricted) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        reason: "CONTRIBUTION_REQUIREMENT_IGNORED",
        periodId: snapshot.periodId,
        activeWatchSeconds: String(snapshot.activeWatchSeconds)
      });
      window.location.assign(`/go?${params.toString()}`);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [pathname, snapshot?.activeWatchSeconds, snapshot?.periodId, snapshot?.restricted]);

  useEffect(() => {
    if (!leader || !snapshot?.reminderDue || reminderOpen || snapshot.exempt || snapshot.checkoutProtected) return;
    const stage = snapshot.reminderStage || "first";
    reminderStageRef.current = stage;
    if (stage === "second") secondReminderDisplayedRef.current = true;
    else firstReminderDisplayedRef.current = true;
    reminderDeadlineRef.current = Date.now() + 16_000;
    setReminderState("due");
    channelRef.current?.postMessage({ type: "reminder-open", stage });
    trackReminderAnalytics(stage === "first" ? "live_contribution_first_reminder_impression" : "live_contribution_second_reminder_impression", stage);
    void transition("reminder_displayed");
  }, [leader, reminderOpen, snapshot?.checkoutProtected, snapshot?.exempt, snapshot?.periodId, snapshot?.reminderDue, snapshot?.reminderStage, trackReminderAnalytics, transition]);

  useEffect(() => {
    if (!reminderOpen) return;
    const remaining = Math.max(0, reminderDeadlineRef.current - Date.now());
    reminderTimerRef.current = window.setTimeout(() => void closeReminder("expired"), remaining);
    return () => {
      if (reminderTimerRef.current) window.clearTimeout(reminderTimerRef.current);
      reminderTimerRef.current = null;
    };
  }, [closeReminder, reminderOpen]);

  useEffect(() => {
    const onMeaningfulActivity = () => {
      if (leader) void transition("activity", pathname.startsWith("/live") ? "live_interaction" : "browsing_interaction");
    };
    window.addEventListener("xmf:meaningful-activity", onMeaningfulActivity);
    return () => window.removeEventListener("xmf:meaningful-activity", onMeaningfulActivity);
  }, [leader, pathname, transition]);

  useEffect(() => {
    if (!pathname.startsWith("/live")) return undefined;
    const onHourlyReminder = () => {
      if (reminderOpen || snapshot?.exempt || snapshot?.checkoutProtected) return;
      hourlyReminderRef.current = true;
      reminderStageRef.current = "second";
      reminderDeadlineRef.current = Date.now() + 16_000;
      setReminderState("due");
      trackReminderAnalytics("live_hourly_credit_reminder_impression", "second");
    };
    window.addEventListener("xmf:live-hourly-credit-reminder", onHourlyReminder);
    return () => window.removeEventListener("xmf:live-hourly-credit-reminder", onHourlyReminder);
  }, [pathname, reminderOpen, snapshot?.checkoutProtected, snapshot?.exempt, trackReminderAnalytics]);

  useEffect(() => {
    const onTipConfirmed = () => {
      if (!leader) return;
      if (!reminderOpen) {
        trackReminderAnalytics("live_contribution_qualified_before_cutoff", reminderStageRef.current);
        void transition("activity", "live_contribution_qualified");
        return;
      }
      void transition("activity", "tip_reminder_confirmed").then((next) => {
        if (!next?.requirementSatisfied) {
          setReminderState("failed");
          return;
        }
        setReminderState("success");
        if (reminderTimerRef.current) window.clearTimeout(reminderTimerRef.current);
        reminderTimerRef.current = window.setTimeout(() => {
          setReminderState("closed");
          channelRef.current?.postMessage({ type: "reminder-closed" });
        }, 900);
      });
    };
    const onTipFailed = () => {
      if (leader && reminderOpen) setReminderState("failed");
    };
    window.addEventListener("xmf:tip-confirmed", onTipConfirmed);
    window.addEventListener("xmf:tip-failed", onTipFailed);
    return () => {
      window.removeEventListener("xmf:tip-confirmed", onTipConfirmed);
      window.removeEventListener("xmf:tip-failed", onTipFailed);
    };
  }, [leader, reminderOpen, trackReminderAnalytics, transition]);

  useEffect(() => {
    if (!snapshot?.unpaidPlaybackStopped || cutoffDispatchedPeriodRef.current === snapshot.periodId) return;
    cutoffDispatchedPeriodRef.current = snapshot.periodId;
    trackReminderAnalytics("live_contribution_unpaid_cutoff", snapshot.reminderStage || "second");
    const dispatchTimer = window.setTimeout(() => window.dispatchEvent(new CustomEvent("xmf:live-unpaid-cutoff")), 0);
    return () => window.clearTimeout(dispatchTimer);
  }, [snapshot?.periodId, snapshot?.reminderStage, snapshot?.unpaidPlaybackStopped, trackReminderAnalytics]);

  useEffect(() => {
    if (!pathname.startsWith("/live")) return undefined;
    const clearRedirect = () => {
      if (cutoffRedirectTimerRef.current !== null) window.clearTimeout(cutoffRedirectTimerRef.current);
      cutoffRedirectTimerRef.current = null;
    };
    const handoff = () => {
      if (paymentInProgressRef.current || redirectStartedRef.current || !cutoffStartedAtRef.current) return;
      redirectStartedRef.current = true;
      const current = snapshotRef.current;
      const params = new URLSearchParams({
        reason: "LIVE_CONTRIBUTION_NOT_COMPLETED",
        periodId: current?.periodId || "",
        activeWatchSeconds: String(current?.activeWatchSeconds || 0),
        firstReminderSeen: String(Boolean(current?.reminderDisplayed)),
        secondReminderSeen: String(current?.reminderStage === null && current?.reminderDisplayed)
      });
      trackReminderAnalytics("live_contribution_redirect_initiated", current?.reminderStage || "second");
      window.location.assign(`/go?${params.toString()}`);
    };
    const schedule = () => {
      clearRedirect();
      const elapsed = cutoffStartedAtRef.current ? Date.now() - cutoffStartedAtRef.current : 0;
      const remaining = Math.max(0, 30_000 - elapsed);
      cutoffRedirectTimerRef.current = window.setTimeout(handoff, remaining);
    };
    const onCutoff = () => {
      if (cutoffStartedAtRef.current || redirectStartedRef.current) return;
      cutoffStartedAtRef.current = Date.now();
      schedule();
    };
        const onPaymentStart = () => {
          paymentInProgressRef.current = true;
          clearRedirect();
          if (cutoffStartedAtRef.current) trackReminderAnalytics("live_contribution_checkout_after_cutoff", "second");
    };
    const onPaymentEnd = () => {
      paymentInProgressRef.current = false;
      if (cutoffStartedAtRef.current && !redirectStartedRef.current) schedule();
    };
    const onTipConfirmed = () => {
      if (!cutoffStartedAtRef.current) return;
      clearRedirect();
          cutoffStartedAtRef.current = null;
          redirectStartedRef.current = false;
          trackReminderAnalytics("live_contribution_post_cutoff", "second");
          trackReminderAnalytics("live_contribution_redirect_cancelled", "second");
    };
    window.addEventListener("xmf:live-unpaid-cutoff", onCutoff);
    window.addEventListener("xmf:payment-flow-started", onPaymentStart);
    window.addEventListener("xmf:payment-flow-ended", onPaymentEnd);
    window.addEventListener("xmf:tip-confirmed", onTipConfirmed);
    return () => {
      clearRedirect();
      window.removeEventListener("xmf:live-unpaid-cutoff", onCutoff);
      window.removeEventListener("xmf:payment-flow-started", onPaymentStart);
      window.removeEventListener("xmf:payment-flow-ended", onPaymentEnd);
      window.removeEventListener("xmf:tip-confirmed", onTipConfirmed);
    };
  }, [pathname, trackReminderAnalytics]);

  const activeReminderState = reminderState as LiveTipReminderState;

  if (!pathname.startsWith("/live")) return null;
  return <>
    {reminderOpen ? <LiveTipReminder requiredCoins={hourlyReminderRef.current ? 32 : snapshot?.requiredCoins || 10} state={activeReminderState} onTipNow={() => { trackReminderAnalytics(reminderStageRef.current === "first" ? "live_contribution_first_reminder_tip_now" : "live_contribution_second_reminder_tip_now", reminderStageRef.current); setReminderState("payment_in_progress"); window.dispatchEvent(new CustomEvent("xmf:payment-flow-started")); window.dispatchEvent(new CustomEvent("xmf:tip-reminder-tip")); }} onBuyCoins={() => { trackReminderAnalytics(reminderStageRef.current === "first" ? "live_contribution_first_reminder_buy_coins" : "live_contribution_second_reminder_buy_coins", reminderStageRef.current); setReminderState("closed"); window.dispatchEvent(new CustomEvent("xmf:tip-reminder-buy-coins")); }} onClose={() => { trackReminderAnalytics(reminderStageRef.current === "first" ? "live_contribution_first_reminder_dismissal" : "live_contribution_second_reminder_dismissal", reminderStageRef.current); dismissReminder(); }} /> : null}
    {snapshot?.restricted ? <div className="contribution-restriction-layer" role="alert">
      <section><h2>{t("contribution.restricted.title")}</h2><p>{t("contribution.restricted.copy")}</p></section>
    </div> : null}
  </>;
}
