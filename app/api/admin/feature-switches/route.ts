import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession } from "@/lib/admin-auth";
import { extractClientIp } from "@/lib/security";

const switchableFeatures = new Set([
  "streaming",
  "theater-audio",
  "redirects",
  "campaigns",
  "referrals",
  "geo",
  "notifications",
  "support",
  "agents",
  "payment-readiness",
  "wallet",
  "bank-payouts",
  "deposit-schedule",
  "access",
  "games",
  "localization",
  "video-health",
  "performance-power",
  "frontend",
  "backend",
  "costs",
  "deployment",
  "sandbox"
  ,"privacy"
]);

const protectedCoreFeatures = new Set([
  "payments",
  "moderation",
  "security",
  "auth",
  "logs",
  "emergency"
]);

const importantSwitches = new Set([
  "streaming",
  "redirects",
  "wallet",
  "bank-payouts",
  "payment-readiness",
  "deposit-schedule",
  "access",
  "backend",
  "deployment"
]);

const actionWindow = new Map<string, { count: number; resetAt: number }>();

async function saveFeatureSwitch(input: {
  featureId: string;
  enabled: boolean;
  adminUserId: string;
  ipAddress: string;
  userAgent: string;
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return false;

  const response = await fetch(`${supabaseUrl}/rest/v1/admin_feature_switches?on_conflict=feature_id`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      feature_id: input.featureId,
      enabled: input.enabled,
      last_changed_by: input.adminUserId,
      last_changed_at: new Date().toISOString(),
      last_change_ip: input.ipAddress,
      last_change_user_agent: input.userAgent
    })
  }).catch(() => null);

  return Boolean(response?.ok);
}

function rateLimit(key: string) {
  const now = Date.now();
  const current = actionWindow.get(key);
  if (!current || current.resetAt < now) {
    actionWindow.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 12;
}

async function parseInput(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    return {
      featureId: String(body.featureId || ""),
      nextState: String(body.nextState || ""),
      confirmed: body.confirmed === true || body.confirmed === "yes"
    };
  }
  const form = await request.formData();
  return {
    featureId: String(form.get("featureId") || ""),
    nextState: String(form.get("nextState") || ""),
    confirmed: form.get("confirmed") === "yes"
  };
}

export async function POST(request: NextRequest) {
  const ipAddress = extractClientIp(request.headers);
  const userAgent = request.headers.get("user-agent") || "unknown";
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);

  if (!admin || admin.role !== "ADMIN") {
    await auditAdminEvent({
      eventType: "admin_feature_switch_denied",
      ipAddress,
      userAgent,
      metadata: { reason: "missing ADMIN session" }
    });
    return NextResponse.json({ ok: false, error: "ADMIN session required." }, { status: 401 });
  }

  if (rateLimit(`${admin.id}:${ipAddress}`)) {
    await auditAdminEvent({
      adminUserId: admin.id,
      eventType: "admin_feature_switch_rate_limited",
      ipAddress,
      userAgent
    });
    return NextResponse.json({ ok: false, error: "Too many ADMIN switch attempts." }, { status: 429 });
  }

  const { featureId, nextState, confirmed } = await parseInput(request);
  const enabled = nextState === "on";

  if (protectedCoreFeatures.has(featureId)) {
    await auditAdminEvent({
      adminUserId: admin.id,
      eventType: "admin_core_switch_blocked",
      ipAddress,
      userAgent,
      metadata: { featureId, attemptedState: nextState }
    });
    return NextResponse.json({ ok: false, error: "Core ADMIN systems cannot be disabled." }, { status: 403 });
  }

  if (!switchableFeatures.has(featureId) || !["on", "off"].includes(nextState)) {
    await auditAdminEvent({
      adminUserId: admin.id,
      eventType: "admin_feature_switch_invalid",
      ipAddress,
      userAgent,
      metadata: { featureId, attemptedState: nextState }
    });
    return NextResponse.json({ ok: false, error: "Unknown feature switch." }, { status: 400 });
  }

  if (!enabled && importantSwitches.has(featureId) && !confirmed) {
    await auditAdminEvent({
      adminUserId: admin.id,
      eventType: "admin_feature_switch_confirmation_required",
      ipAddress,
      userAgent,
      metadata: { featureId, attemptedState: nextState }
    });
    return NextResponse.json({ ok: false, error: "Confirmation is required before disabling this important system." }, { status: 400 });
  }

  await auditAdminEvent({
    adminUserId: admin.id,
    eventType: "admin_feature_switch_requested",
    ipAddress,
    userAgent,
    metadata: {
      featureId,
      enabled,
      preservationRule: "Configuration and historical logs must be preserved when optional features are disabled.",
      approvalNote: enabled ? "Feature enable requested." : "Feature disable requested. Important systems require UI confirmation before this action."
    }
  });
  const persisted = await saveFeatureSwitch({ featureId, enabled, adminUserId: admin.id, ipAddress, userAgent });

  if ((request.headers.get("accept") || "").includes("text/html")) {
    return NextResponse.redirect(new URL(`/admin?switch=${persisted ? "saved" : "logged"}`, request.url), { status: 303 });
  }

  return NextResponse.json({
    ok: true,
    featureId,
    enabled,
    auditLogged: true,
    persisted,
    note: persisted
      ? "Switch action was validated, audit logged, and persisted server-side."
      : "Switch action was validated and audit logged. Configure Supabase service credentials to persist feature flag state."
  });
}
