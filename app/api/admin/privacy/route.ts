import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession } from "@/lib/admin-auth";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { extractClientIp } from "@/lib/security";

const defaults = { enabled: true, popupDelaySeconds: 46, consentVersion: "1.0", consentLifetimeDays: 180, privacyPolicyUrl: "/policies#privacy", cookiePolicyUrl: "/policies#cookies", gpcSupport: true };
type ConsentStats = { total: number; accepted: number; rejected: number; customized: number; analytics: number; gpc: number };

async function requireAdmin(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  return admin?.role === "ADMIN" ? admin : null;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: "ADMIN session required." }, { status: 401 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ settings: defaults, stats: { total: 0, accepted: 0, rejected: 0, customized: 0, analytics: 0, gpc: 0 } });
  const [settingsResponse, eventsResponse] = await Promise.all([
    fetch(`${service.url}/rest/v1/privacy_consent_settings?select=*&id=eq.primary`, { headers: serviceHeaders(service) }),
    fetch(`${service.url}/rest/v1/privacy_consent_events?select=analytics,functional,marketing,advertising,gpc&environment=eq.production&limit=5000`, { headers: serviceHeaders(service) })
  ]);
  const settingsRows = settingsResponse.ok ? await settingsResponse.json() as Array<Record<string, unknown>> : [];
  const events = eventsResponse.ok ? await eventsResponse.json() as Array<Record<string, unknown>> : [];
  const stats = events.reduce<ConsentStats>((summary, event) => {
    const optional = [event.analytics, event.functional, event.marketing, event.advertising].some(Boolean);
    const all = [event.analytics, event.functional, event.marketing, event.advertising].every(Boolean);
    summary.total += 1; summary.accepted += all ? 1 : 0; summary.rejected += optional ? 0 : 1; summary.customized += optional && !all ? 1 : 0; summary.analytics += event.analytics === true ? 1 : 0; summary.gpc += event.gpc === true ? 1 : 0;
    return summary;
  }, { total: 0, accepted: 0, rejected: 0, customized: 0, analytics: 0, gpc: 0 });
  const row = settingsRows[0];
  return NextResponse.json({ settings: row ? { enabled: row.enabled !== false, popupDelaySeconds: Number(row.popup_delay_seconds || 46), consentVersion: String(row.consent_version || "1.0"), consentLifetimeDays: Number(row.consent_lifetime_days || 180), privacyPolicyUrl: String(row.privacy_policy_url || defaults.privacyPolicyUrl), cookiePolicyUrl: String(row.cookie_policy_url || defaults.cookiePolicyUrl), gpcSupport: row.gpc_support !== false } : defaults, stats });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  const ipAddress = extractClientIp(request.headers);
  const userAgent = request.headers.get("user-agent") || "unknown";
  if (!admin) return NextResponse.json({ error: "ADMIN session required." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const service = serviceCredentials();
  const settings = {
    id: "primary", enabled: body.enabled !== false, popup_delay_seconds: Math.max(5, Math.min(3600, Number(body.popupDelaySeconds || 46))), consent_version: String(body.consentVersion || "1.0").slice(0, 30), consent_lifetime_days: Math.max(1, Math.min(730, Number(body.consentLifetimeDays || 180))), privacy_policy_url: "/policies#privacy", cookie_policy_url: "/policies#cookies", gpc_support: body.gpcSupport !== false, updated_by: admin.id, updated_at: new Date().toISOString()
  };
  const saved = service ? await fetch(`${service.url}/rest/v1/privacy_consent_settings?on_conflict=id`, { method: "POST", headers: serviceHeaders(service, "resolution=merge-duplicates,return=minimal"), body: JSON.stringify(settings) }).then((response) => response.ok).catch(() => false) : false;
  await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_privacy_settings_updated", ipAddress, userAgent, metadata: { enabled: settings.enabled, popupDelaySeconds: settings.popup_delay_seconds, consentVersion: settings.consent_version, consentLifetimeDays: settings.consent_lifetime_days, gpcSupport: settings.gpc_support } });
  return NextResponse.json({ ok: true, saved, settings: { ...settings, popupDelaySeconds: settings.popup_delay_seconds, consentVersion: settings.consent_version, consentLifetimeDays: settings.consent_lifetime_days, privacyPolicyUrl: settings.privacy_policy_url, cookiePolicyUrl: settings.cookie_policy_url, gpcSupport: settings.gpc_support } });
}
