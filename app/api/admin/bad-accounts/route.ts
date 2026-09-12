import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession, hasAdminPermission, hasRecentAdminReauthentication } from "@/lib/admin-auth";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { extractClientIp } from "@/lib/security";

async function authorized(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  return admin && admin.two_factor_required && hasAdminPermission(admin, "admin.customers.manage") ? admin : null;
}

async function rows(path: string) {
  const service = serviceCredentials();
  if (!service) return [];
  const response = await fetch(`${service.url}/rest/v1/${path}`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null);
  return response?.ok ? await response.json() as Array<Record<string, unknown>> : [];
}

export async function GET(request: NextRequest) {
  if (!await authorized(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!serviceCredentials()) return NextResponse.json({ configured: false, records: [], settings: null });
  const [records, notes, restorations, settings, attempts, contributions, periods, reminders] = await Promise.all([
    rows("contribution_restrictions?select=*&order=most_recent_restricted_at.desc&limit=500"),
    rows("contribution_admin_notes?select=*&order=created_at.desc&limit=1000"),
    rows("contribution_admin_reinstatements?select=*&order=created_at.desc&limit=1000"),
    rows("contribution_rule_settings?id=eq.1&select=*&limit=1"),
    rows("contribution_restricted_attempts?select=*&order=created_at.desc&limit=2000"),
    rows("contribution_transactions?select=*&order=created_at.desc&limit=2000"),
    rows("contribution_watch_periods?select=id,subject_ref,user_id,started_at,completed_at&order=started_at.desc&limit=2000"),
    rows("contribution_reminder_events?select=*&order=created_at.desc&limit=2000")
  ]);
  const periodSubject = new Map(periods.map((period) => [period.id, period.subject_ref]));
  return NextResponse.json({
    configured: true,
    settings: settings[0] || null,
    records: records.map((record) => ({
      ...record,
      notes: notes.filter((note) => note.restriction_id === record.id),
      restorations: restorations.filter((item) => item.restriction_id === record.id),
      attempts: attempts.filter((item) => item.restriction_id === record.id),
      contributions: contributions.filter((item) => item.user_id && item.user_id === record.user_id),
      reminders: reminders.filter((item) => periodSubject.get(item.period_id) === record.subject_ref)
    }))
  });
}

export async function POST(request: NextRequest) {
  const admin = await authorized(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "");
  const restrictionId = String(body.restrictionId || "");
  const reason = String(body.reason || "").trim().slice(0, 1000);
  let response: Response | null = null;

  if (action === "restore") {
    if (!await hasRecentAdminReauthentication(request.cookies.get(adminSessionCookie)?.value)) return NextResponse.json({ error: "Recent reauthentication is required before restoring access." }, { status: 428 });
    const restorationType = String(body.restorationType);
    const restoredUntil = restorationType === "temporary" ? new Date(String(body.restoredUntil || "")) : null;
    if (body.confirmed !== true || reason.length < 5 || !["temporary", "permanent", "reverse_incorrect", "reset_period"].includes(restorationType)
        || (restorationType === "temporary" && (!restoredUntil || !Number.isFinite(restoredUntil.getTime())
          || restoredUntil.getTime() <= Date.now() || restoredUntil.getTime() > Date.now() + 7 * 24 * 60 * 60 * 1000))) {
      return NextResponse.json({ error: "Confirmation, restoration type, and a clear reason are required." }, { status: 400 });
    }
    response = await fetch(`${service.url}/rest/v1/rpc/admin_restore_contribution_access`, {
      method: "POST",
      headers: serviceHeaders(service),
      body: JSON.stringify({
        p_restriction_id: restrictionId, p_admin_user_id: admin.id,
        p_restoration_type: restorationType, p_reason: reason, p_restored_until: restoredUntil?.toISOString() || null
      })
    }).catch(() => null);
  } else if (action === "exemption") {
    if (!await hasRecentAdminReauthentication(request.cookies.get(adminSessionCookie)?.value)) return NextResponse.json({ error: "Recent reauthentication is required before changing an exemption." }, { status: 428 });
    if (body.confirmed !== true || reason.length < 5 || typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "Confirmation, exemption state, and a clear reason are required." }, { status: 400 });
    }
    response = await fetch(`${service.url}/rest/v1/rpc/admin_set_contribution_exemption`, {
      method: "POST",
      headers: serviceHeaders(service),
      body: JSON.stringify({
        p_restriction_id: restrictionId, p_admin_user_id: admin.id, p_enabled: body.enabled,
        p_reason: reason, p_duration_minutes: Math.min(1440, Math.max(1, Math.floor(Number(body.durationMinutes || 60))))
      })
    }).catch(() => null);
  } else if (action === "note") {
    if (reason.length < 2) return NextResponse.json({ error: "Enter an internal note." }, { status: 400 });
    response = await fetch(`${service.url}/rest/v1/contribution_admin_notes`, {
      method: "POST", headers: serviceHeaders(service, "return=minimal"),
      body: JSON.stringify({ restriction_id: restrictionId, admin_user_id: admin.id, note: reason })
    }).catch(() => null);
  } else if (action === "settings") {
    if (!await hasRecentAdminReauthentication(request.cookies.get(adminSessionCookie)?.value)) return NextResponse.json({ error: "Recent reauthentication is required before changing enforcement settings." }, { status: 428 });
    const nullableThreshold = (value: unknown) => value === null || value === "" ? null : Math.max(1, Math.floor(Number(value)));
    const requestedCategories = Array.isArray(body.eligiblePurchaseCategories)
      ? body.eligiblePurchaseCategories.map(String).filter((value) => ["tip", "coin_purchase", "merchandise", "digital_purchase", "approved_purchase"].includes(value))
      : ["tip", "coin_purchase", "merchandise", "digital_purchase"];
    const exemptionScope = ["current_period", "live_session", "future_sessions"].includes(String(body.exemptionScope))
      ? String(body.exemptionScope) : "current_period";
    response = await fetch(`${service.url}/rest/v1/contribution_rule_settings?id=eq.1`, {
      method: "PATCH",
      headers: serviceHeaders(service, "return=minimal"),
      body: JSON.stringify({
        period_seconds: Math.max(60, Math.floor(Number(body.periodSeconds || 1500))),
        required_coins: 10,
        reminder_duration_seconds: 16,
        grace_seconds: Math.max(0, Math.floor(Number(body.graceSeconds || 300))),
        ignored_notices_before_restriction: Math.max(1, Math.floor(Number(body.ignoredNotices || 1))),
        repeat_attempt_threshold: nullableThreshold(body.repeatAttemptThreshold),
        large_tip_threshold_coins: Math.max(20, Math.floor(Number(body.largeTipThresholdCoins || 20))),
        coin_purchase_threshold_coins: nullableThreshold(body.coinPurchaseThresholdCoins),
        merchandise_threshold_coins: nullableThreshold(body.merchandiseThresholdCoins),
        exemption_duration_minutes: Math.max(1, Math.floor(Number(body.exemptionDurationMinutes || 60))),
        maximum_exemption_minutes: Math.min(10080, Math.max(
          Math.floor(Number(body.exemptionDurationMinutes || 60)),
          Math.floor(Number(body.maximumExemptionMinutes || 1440))
        )),
        exemption_scope: exemptionScope,
        eligible_purchase_categories: requestedCategories,
        activity_protection_seconds: Math.min(900, Math.max(0, Math.floor(Number(body.activityProtectionSeconds ?? 300)))),
        checkout_protection_seconds: Math.min(1800, Math.max(60, Math.floor(Number(body.checkoutProtectionSeconds || 600)))),
        guest_enforcement_enabled: body.guestEnforcementEnabled !== false,
        anonymous_tip_events_enabled: body.anonymousTipEventsEnabled !== false,
        public_tip_messages_enabled: body.publicTipMessagesEnabled !== false,
        clips4sale_destination_reference: "external_platforms.clips4sale",
        legacy_twenty_five_dollar_rule_disabled: true,
        updated_by: admin.id, updated_at: new Date().toISOString()
      })
    }).catch(() => null);
  } else return NextResponse.json({ error: "Unsupported action." }, { status: 400 });

  if (!response?.ok) return NextResponse.json({ error: "The protected action was rejected." }, { status: 422 });
  await auditAdminEvent({
    adminUserId: admin.id, eventType: `admin_contribution_${action}`,
    ipAddress: extractClientIp(request.headers), userAgent: request.headers.get("user-agent") || "unknown",
    metadata: { restrictionId, reason, restorationType: body.restorationType || null, exemptionEnabled: body.enabled ?? null }
  });
  return NextResponse.json({ ok: true });
}
