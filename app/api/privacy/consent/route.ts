import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { extractClientIp } from "@/lib/security";
import { COOKIE_CONSENT_VERSION } from "@/lib/privacy-consent";

const rateWindow = new Map<string, { count: number; expires: number }>();

export async function POST(request: NextRequest) {
  const ip = extractClientIp(request.headers);
  const now = Date.now();
  const existing = rateWindow.get(ip);
  if (!existing || existing.expires < now) rateWindow.set(ip, { count: 1, expires: now + 60_000 });
  else if (++existing.count > 30) return NextResponse.json({ ok: false, error: "Too many consent updates." }, { status: 429 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ ok: true, stored: false });
  const sessionHash = createHash("sha256").update(`${ip}:${request.headers.get("user-agent") || ""}:${process.env.ANALYTICS_HASH_SALT || "xmf-local"}`).digest("hex");
  const payload = {
    consent_version: String(body.consentVersion || COOKIE_CONSENT_VERSION).slice(0, 30),
    necessary: true,
    analytics: body.analytics === true,
    functional: body.functional === true,
    marketing: body.marketing === true,
    advertising: body.advertising === true,
    gpc: body.gpc === true,
    environment: body.environment === "sandbox" ? "sandbox" : "production",
    anonymous_session_hash: sessionHash
  };
  const response = await fetch(`${service.url}/rest/v1/privacy_consent_events`, { method: "POST", headers: serviceHeaders(service, "return=minimal"), body: JSON.stringify(payload) }).catch(() => null);
  return NextResponse.json({ ok: true, stored: Boolean(response?.ok) });
}
