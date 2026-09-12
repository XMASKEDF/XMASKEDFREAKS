import { NextRequest, NextResponse } from "next/server";
import {
  adminSessionCookie,
  auditAdminEvent,
  getAdminBySession,
  getAdminSecuritySettings,
  hasRecentAdminReauthentication,
  hasAdminPermission,
  isSuperAdmin,
  updateAdminTwoFactorSetting
} from "@/lib/admin-auth";
import { extractClientIp } from "@/lib/security";
import { clearStoredBotDetectionConfigCache, getStoredBotDetectionConfig, normalizeBotDetectionLevel, normalizeBotProtectionSensitivity } from "@/lib/infrastructure/bot-policy";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";

async function authorized(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  return admin && hasAdminPermission(admin, "admin.security.manage") ? admin : null;
}

export async function GET(request: NextRequest) {
  if (!await authorized(request)) return NextResponse.json({ message: "Not found." }, { status: 404 });
  const settings = await getAdminSecuritySettings();
  const service = serviceCredentials();
  const response = service ? await fetch(`${service.url}/rest/v1/security_settings?id=eq.1&select=bot_detection_enabled,bot_detection_level,bot_detection_supervisor_agent_id,bot_protection_sensitivity&limit=1`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null) : null;
  const rows = response?.ok ? await response.json().catch(() => []) as Array<Record<string, unknown>> : [];
  const config = await getStoredBotDetectionConfig();
  return NextResponse.json({ ...settings, botDetectionEnabled: rows[0]?.bot_detection_enabled ?? config.enabled, botDetectionLevel: normalizeBotDetectionLevel(rows[0]?.bot_detection_level || config.level), botDetectionSupervisorAgentId: "Sage", bot_protection_sensitivity: normalizeBotProtectionSensitivity(rows[0]?.bot_protection_sensitivity) });
}

export async function PATCH(request: NextRequest) {
  const admin = await authorized(request);
  if (!admin) return NextResponse.json({ message: "Not found." }, { status: 404 });
  const token = request.cookies.get(adminSessionCookie)?.value;
  if (!isSuperAdmin(admin) || !await hasRecentAdminReauthentication(token)) {
    return NextResponse.json({ message: "Super Admin and recent reauthentication are required." }, { status: 428 });
  }
  const body = await request.json().catch(() => ({})) as { emailTwoFactorEnabled?: unknown; botProtectionSensitivity?: unknown; botDetectionEnabled?: unknown; botDetectionLevel?: unknown };
  const hasTwoFactorUpdate = typeof body.emailTwoFactorEnabled === "boolean";
  const hasSensitivityUpdate = body.botProtectionSensitivity !== undefined;
  const hasBotEnabledUpdate = typeof body.botDetectionEnabled === "boolean";
  const hasBotLevelUpdate = body.botDetectionLevel !== undefined;
  if (!hasTwoFactorUpdate && !hasSensitivityUpdate && !hasBotEnabledUpdate && !hasBotLevelUpdate) return NextResponse.json({ message: "A valid security setting is required." }, { status: 400 });
  let savedBotConfig: { enabled: boolean; level: string } | null = null;
  try {
    const context = { ipAddress: extractClientIp(request.headers), userAgent: request.headers.get("user-agent") || "" };
    if (hasTwoFactorUpdate) await updateAdminTwoFactorSetting(admin, body.emailTwoFactorEnabled as boolean, context);
    if (hasSensitivityUpdate) {
      const sensitivity = normalizeBotProtectionSensitivity(body.botProtectionSensitivity);
      if (body.botProtectionSensitivity !== "low" && body.botProtectionSensitivity !== "balanced" && body.botProtectionSensitivity !== "high") return NextResponse.json({ message: "Invalid bot protection sensitivity." }, { status: 400 });
      const service = serviceCredentials();
      if (!service) return NextResponse.json({ message: "Connect Supabase before changing bot protection sensitivity." }, { status: 503 });
      const response = await fetch(`${service.url}/rest/v1/security_settings?id=eq.1`, { method: "PATCH", headers: { ...serviceHeaders(service), prefer: "return=minimal" }, body: JSON.stringify({ bot_protection_sensitivity: sensitivity, updated_at: new Date().toISOString() }) }).catch(() => null);
      if (!response?.ok) return NextResponse.json({ message: "The bot protection sensitivity could not be stored." }, { status: 503 });
      await auditAdminEvent({ adminUserId: admin.id, eventType: "bot_protection_sensitivity_changed", ipAddress: context.ipAddress, userAgent: context.userAgent, metadata: { sensitivity } });
    }
    if (hasBotEnabledUpdate || hasBotLevelUpdate) {
      const before = await getStoredBotDetectionConfig();
      const level = normalizeBotDetectionLevel(body.botDetectionLevel ?? before.level);
      if (hasBotLevelUpdate && body.botDetectionLevel !== level) return NextResponse.json({ message: "Bot detection level must be SIMPLE, EASY, MEDIUM, or HARD." }, { status: 400 });
      const service = serviceCredentials();
      if (!service) return NextResponse.json({ message: "Connect Supabase before changing Bot Detection settings." }, { status: 503 });
      const next = { enabled: hasBotEnabledUpdate ? body.botDetectionEnabled === true : before.enabled, level };
      const response = await fetch(`${service.url}/rest/v1/security_settings?id=eq.1`, { method: "PATCH", headers: { ...serviceHeaders(service), prefer: "return=minimal" }, body: JSON.stringify({ bot_detection_enabled: next.enabled, bot_detection_level: next.level, bot_detection_supervisor_agent_id: "Sage", updated_at: new Date().toISOString() }) }).catch(() => null);
      if (!response?.ok) return NextResponse.json({ message: "Bot Detection settings could not be stored." }, { status: 503 });
      clearStoredBotDetectionConfigCache();
      savedBotConfig = next;
      await auditAdminEvent({ adminUserId: admin.id, eventType: "bot_detection_policy_changed", ipAddress: context.ipAddress, userAgent: context.userAgent, metadata: { old: { enabled: before.enabled, level: before.level, supervisorAgentId: before.supervisorAgentId }, new: { ...next, supervisorAgentId: "Sage" } } });
    }
    return NextResponse.json({ ok: true, ...(hasTwoFactorUpdate ? { emailTwoFactorEnabled: body.emailTwoFactorEnabled } : {}), ...(hasSensitivityUpdate ? { botProtectionSensitivity: normalizeBotProtectionSensitivity(body.botProtectionSensitivity) } : {}), ...(savedBotConfig ? { botDetectionEnabled: savedBotConfig.enabled, botDetectionLevel: savedBotConfig.level, botDetectionSupervisorAgentId: "Sage" } : {}) });
  } catch {
    return NextResponse.json({ message: "Unable to update security settings." }, { status: 400 });
  }
}
