import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getApiUser, serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { appConfig } from "@/lib/config";
import { recordReliabilityIncident } from "@/lib/reliability/server";
import {
  DEFAULT_CONTRIBUTION_SETTINGS,
  contributionSatisfied,
  deriveContributionReminderState,
  type ContributionPeriodSnapshot,
  type ReminderCloseReason
} from "@/lib/contribution-policy";
import { createLiveGuestCookie, LIVE_GUEST_COOKIE, liveSubjectReference } from "@/lib/live/guest-identity";

export const dynamic = "force-dynamic";

const allowedActions = new Set(["status", "activity", "reminder_displayed", "reminder_manual_close", "reminder_auto_expired", "checkout_started", "restricted_access_attempt"]);
const memoryPeriods = new Map<string, ContributionPeriodSnapshot & {
  lastHeartbeat: number; lastBrowsingAt: number | null; enforcementDeferredUntil: number | null;
  reminderShownAt: number | null; graceAt: number | null; checkoutStartedAt: number | null;
  checkoutUntil: number | null; eventKeys: Set<string>;
  firstReminderDisplayed: boolean; secondReminderDisplayed: boolean;
  firstReminderDismissed: boolean; secondReminderDismissed: boolean;
}>();

function fallbackPeriod(subjectRef: string) {
  const existing = memoryPeriods.get(subjectRef);
  if (existing) return existing;
  const created: ContributionPeriodSnapshot & {
    lastHeartbeat: number; lastBrowsingAt: number | null; enforcementDeferredUntil: number | null;
    reminderShownAt: number | null; graceAt: number | null; checkoutStartedAt: number | null;
    checkoutUntil: number | null; eventKeys: Set<string>;
    firstReminderDisplayed: boolean; secondReminderDisplayed: boolean;
    firstReminderDismissed: boolean; secondReminderDismissed: boolean;
  } = {
    periodId: randomUUID(), activeWatchSeconds: 0, contributedCoins: 0, purchaseCoins: 0,
    requirementSatisfied: false, reminderDue: false, reminderStage: null, reminderDisplayed: false, reminderDismissed: false,
    reminderCloseReason: null, restricted: false, restrictionReason: null, exempt: false,
    exemptionReason: null, exemptionExpiresAt: null, checkoutProtected: false, graceExpiresAt: null,
    redirectToClips4Sale: false, violationAttempts: 0, lastHeartbeat: Date.now(), lastBrowsingAt: null,
    enforcementDeferredUntil: null, reminderShownAt: null, graceAt: null, checkoutStartedAt: null,
    checkoutUntil: null, eventKeys: new Set(), unpaidPlaybackStopped: false,
    firstReminderDisplayed: false, secondReminderDisplayed: false,
    firstReminderDismissed: false, secondReminderDismissed: false
  };
  memoryPeriods.set(subjectRef, created);
  return created;
}

function transitionFallback(subjectRef: string, action: string, route: string, eventKey: string, metadata: Record<string, unknown>) {
  let period = fallbackPeriod(subjectRef);
  const now = Date.now();
  const duplicate = period.eventKeys.has(eventKey);
  if (!duplicate) period.eventKeys.add(eventKey);
  const elapsed = Math.min(65, Math.max(0, Math.floor((now - period.lastHeartbeat) / 1000)));
  if (metadata.visible === true && metadata.mediaActive === true && route.startsWith("/live")) period.activeWatchSeconds += elapsed;
  if (!duplicate && action === "activity") period.lastBrowsingAt = now;
  period.lastHeartbeat = now;
  const stage = metadata.reminderStage === "second" ? "second" : "first";
  if (!duplicate && action === "reminder_displayed") {
    if (stage === "second") period.secondReminderDisplayed = true;
    else period.firstReminderDisplayed = true;
    period.reminderDisplayed = period.firstReminderDisplayed || period.secondReminderDisplayed;
    period.reminderStage = stage;
    period.reminderShownAt = now;
  }
  if (!duplicate && action === "activity" && ["tip_reminder_confirmed", "live_contribution_qualified"].includes(String(metadata.activityType))) {
    period.contributedCoins = Math.max(period.contributedCoins, DEFAULT_CONTRIBUTION_SETTINGS.requiredCoins);
    period.requirementSatisfied = true;
    period.graceAt = now + DEFAULT_CONTRIBUTION_SETTINGS.graceSeconds * 1000;
    period.graceExpiresAt = new Date(period.graceAt).toISOString();
  }
  if (!duplicate && ["reminder_manual_close", "reminder_auto_expired"].includes(action)) {
    if (stage === "second") period.secondReminderDismissed = true;
    else period.firstReminderDismissed = true;
    period.reminderDismissed = period.firstReminderDismissed || period.secondReminderDismissed;
    period.reminderCloseReason = (action === "reminder_manual_close" ? "manual" : "expired") as ReminderCloseReason;
  }
  if (!duplicate && action === "checkout_started" && period.checkoutStartedAt === null) {
    period.checkoutStartedAt = now;
    period.checkoutUntil = now + DEFAULT_CONTRIBUTION_SETTINGS.checkoutProtectionSeconds * 1000;
  }
  period.checkoutProtected = (period.checkoutUntil || 0) > now;
  period.requirementSatisfied = contributionSatisfied(period.contributedCoins, period.purchaseCoins);
  if (period.activeWatchSeconds >= DEFAULT_CONTRIBUTION_SETTINGS.periodSeconds && (period.requirementSatisfied || period.exempt)) {
    memoryPeriods.delete(subjectRef);
    period = fallbackPeriod(subjectRef);
  }
  if (period.activeWatchSeconds >= DEFAULT_CONTRIBUTION_SETTINGS.unpaidCutoffSeconds && !period.requirementSatisfied && !period.exempt) period.unpaidPlaybackStopped = true;
  const reminderState = deriveContributionReminderState({
    activeWatchSeconds: period.activeWatchSeconds,
    firstReminderDisplayed: period.firstReminderDisplayed,
    firstReminderDismissed: period.firstReminderDismissed,
    secondReminderDisplayed: period.secondReminderDisplayed,
    secondReminderDismissed: period.secondReminderDismissed,
    requirementSatisfied: period.requirementSatisfied,
    exempt: period.exempt,
    checkoutProtected: period.checkoutProtected,
    unpaidPlaybackStopped: period.unpaidPlaybackStopped
  });
  period.reminderDue = reminderState.reminderDue;
  period.reminderStage = reminderState.reminderStage;
  if (period.activeWatchSeconds >= DEFAULT_CONTRIBUTION_SETTINGS.periodSeconds && period.reminderDismissed
      && (period.graceAt || 0) <= now && !period.requirementSatisfied && !period.exempt && !period.checkoutProtected) {
    if (period.lastBrowsingAt && period.lastBrowsingAt > now - DEFAULT_CONTRIBUTION_SETTINGS.activityProtectionSeconds * 1000) {
      period.enforcementDeferredUntil ??= now + DEFAULT_CONTRIBUTION_SETTINGS.activityProtectionSeconds * 1000;
    }
    if (!period.enforcementDeferredUntil || period.enforcementDeferredUntil <= now) {
      period.restricted = true;
      period.restrictionReason = "contribution_requirement_ignored";
    }
  }
  if (!duplicate && action === "restricted_access_attempt" && period.restricted) period.violationAttempts += 1;
  return period;
}

async function databaseTransition(subjectRef: string, userId: string | null, action: string, route: string, eventKey: string, metadata: Record<string, unknown>) {
  const service = serviceCredentials();
  if (!service) return null;
  const payload = JSON.stringify({
    p_subject_ref: subjectRef,
    p_user_id: userId,
    p_action: action,
    p_route: route,
    p_event_key: eventKey,
    p_metadata: metadata
  });
  const response = await fetch(`${service.url}/rest/v1/rpc/transition_live_contribution_period`, {
    method: "POST",
    cache: "no-store",
    headers: serviceHeaders(service),
    body: payload
  }).catch(() => null);
  if (!response?.ok) {
    const legacyResponse = await fetch(`${service.url}/rest/v1/rpc/transition_contribution_period`, {
      method: "POST", cache: "no-store", headers: serviceHeaders(service),
      body: JSON.stringify({
        p_subject_ref: subjectRef,
        p_user_id: userId,
        p_action: action,
        p_route: route,
        p_event_key: eventKey,
        p_metadata: { ...metadata, visible: metadata.visible === true && metadata.mediaActive === true }
      })
    }).catch(() => null);
    if (!legacyResponse?.ok) return null;
    return await legacyResponse.json() as ContributionPeriodSnapshot;
  }
  return await response.json() as ContributionPeriodSnapshot;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "status");
  if (!allowedActions.has(action)) return NextResponse.json({ ok: false, message: "Unsupported access action." }, { status: 400 });
  const route = String(body.route || "/live").slice(0, 500);
  const eventKey = String(body.eventKey || "").trim().slice(0, 180);
  if (eventKey.length < 8) return NextResponse.json({ ok: false, message: "A unique activity key is required." }, { status: 400 });
  if (["reminder_displayed", "reminder_manual_close", "reminder_auto_expired", "restricted_access_attempt"].includes(action)
      && !route.startsWith("/live")) {
    return NextResponse.json({ ok: false, message: "This action is valid only for the protected Live route." }, { status: 400 });
  }
  const user = await getApiUser(request);
  const existingGuest = request.cookies.get(LIVE_GUEST_COOKIE)?.value;
  const nextGuest = existingGuest || createLiveGuestCookie();
  const subjectRef = liveSubjectReference(user?.id || null, nextGuest);
  if (!subjectRef) return NextResponse.json({ ok: false, message: "Live identity could not be established." }, { status: 503 });
  const metadata = {
    visible: body.visible === true,
    mediaActive: body.mediaActive === true,
    activityType: String(body.activityType || action).slice(0, 80),
    locale: String(body.locale || "en").slice(0, 20),
    pageLoadId: String(body.pageLoadId || "").slice(0, 120),
    reminderStage: body.reminderStage === "second" ? "second" : "first"
  };
  const service = serviceCredentials();
  const databaseSnapshot = await databaseTransition(subjectRef, user?.id || null, action, route, eventKey, metadata);
  if (service && !databaseSnapshot) {
    await recordReliabilityIncident({
      title: "Contribution watch-period transition failed",
      plainExplanation: "The server could not verify the visitor contribution period, so protected Live access was not advanced.",
      technicalExplanation: "transition_contribution_period returned no verified snapshot.",
      severity: 4,
      feature: "Live",
      affectedRoute: route,
      affectedCustomerCount: 1,
      automaticResponse: "Failed closed without trusting a browser timer.",
      recommendedAdminAction: "Check the contribution migration, Supabase RPC availability, and recent database logs."
    });
    return NextResponse.json({ ok: false, message: "Live contribution status is temporarily unavailable." }, { status: 503 });
  }
  const snapshot = databaseSnapshot || transitionFallback(subjectRef, action, route, eventKey, metadata);
  if (snapshot.redirectToClips4Sale && service) {
    await fetch(`${service.url}/rest/v1/rpc/record_contribution_redirect`, {
      method: "POST",
      cache: "no-store",
      headers: serviceHeaders(service),
      body: JSON.stringify({
        p_subject_ref: subjectRef,
        p_event_key: `clips:${eventKey}`,
        p_destination_reference: "external_platforms.clips4sale",
        p_destination_url: appConfig.clipsRedirectUrl,
        p_reason: "repeat_restricted_access",
        p_referral_source: request.headers.get("referer") || "Direct"
      })
    }).catch(() => null);
  }
  const publicSnapshot: ContributionPeriodSnapshot = {
    periodId: snapshot.periodId,
    activeWatchSeconds: snapshot.activeWatchSeconds,
    contributedCoins: snapshot.contributedCoins,
    purchaseCoins: snapshot.purchaseCoins,
    requirementSatisfied: snapshot.requirementSatisfied,
    reminderDue: snapshot.reminderDue,
    reminderStage: snapshot.reminderStage || null,
    reminderDisplayed: snapshot.reminderDisplayed,
    reminderDismissed: snapshot.reminderDismissed,
    reminderCloseReason: snapshot.reminderCloseReason,
    restricted: snapshot.restricted,
    restrictionReason: snapshot.restrictionReason,
    exempt: snapshot.exempt,
    exemptionReason: snapshot.exemptionReason,
    exemptionExpiresAt: snapshot.exemptionExpiresAt,
    checkoutProtected: snapshot.checkoutProtected,
    graceExpiresAt: snapshot.graceExpiresAt,
    redirectToClips4Sale: snapshot.redirectToClips4Sale,
    violationAttempts: snapshot.violationAttempts,
    unpaidPlaybackStopped: snapshot.unpaidPlaybackStopped || false
  };
  const response = NextResponse.json({
    ok: true,
    ruleName: "Live Entry and Refillable Viewing Credit",
    minimumPayment: appConfig.minimumAccessPayment,
    requiredCoins: appConfig.minimumAccessCoins,
    reminderDurationSeconds: appConfig.contributionReminderSeconds,
    clips4SaleUrl: snapshot.redirectToClips4Sale ? appConfig.clipsRedirectUrl : null,
    ...publicSnapshot
  }, { headers: { "Cache-Control": "no-store, private" } });
  if (!existingGuest && !user) {
    response.cookies.set(LIVE_GUEST_COOKIE, nextGuest, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
      path: "/", maxAge: 60 * 60 * 24 * 30
    });
  }
  return response;
}
