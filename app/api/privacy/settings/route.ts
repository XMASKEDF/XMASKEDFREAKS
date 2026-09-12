import { NextResponse } from "next/server";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";

const defaults = { enabled: true, popupDelaySeconds: 46, consentVersion: "1.0", consentLifetimeDays: 180, gpcSupport: true };

export async function GET() {
  const service = serviceCredentials();
  if (!service) return NextResponse.json(defaults, { headers: { "cache-control": "no-store" } });
  const response = await fetch(`${service.url}/rest/v1/privacy_consent_settings?select=enabled,popup_delay_seconds,consent_version,consent_lifetime_days,gpc_support&id=eq.primary`, { headers: serviceHeaders(service), cache: "no-store" }).catch(() => null);
  if (!response?.ok) return NextResponse.json(defaults, { headers: { "cache-control": "no-store" } });
  const row = (await response.json() as Array<Record<string, unknown>>)[0];
  return NextResponse.json(row ? { enabled: row.enabled !== false, popupDelaySeconds: Number(row.popup_delay_seconds || 46), consentVersion: String(row.consent_version || "1.0"), consentLifetimeDays: Number(row.consent_lifetime_days || 180), gpcSupport: row.gpc_support !== false } : defaults, { headers: { "cache-control": "no-store" } });
}
