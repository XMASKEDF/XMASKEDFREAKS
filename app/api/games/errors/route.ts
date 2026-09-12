import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { extractClientIp } from "@/lib/security";

export const dynamic = "force-dynamic";
const limits = new Map<string, { count: number; resetAt: number }>();

function limited(key: string, maximum = 12) {
  const now = Date.now(); const current = limits.get(key);
  if (!current || current.resetAt < now) { limits.set(key, { count: 1, resetAt: now + 60_000 }); return false; }
  current.count += 1; return current.count > maximum;
}

function text(value: unknown, maximum: number) { return String(value || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, maximum); }

export async function POST(request: NextRequest) {
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ ok: true, stored: false });
  const ipHash = createHash("sha256").update(`${extractClientIp(request.headers)}:${process.env.GAME_ERROR_LOG_SALT || "xmf-game-errors"}`).digest("hex");
  if (limited(ipHash)) return NextResponse.json({ ok: false }, { status: 429 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const message = text(body.errorMessage, 1000) || "Unknown Games error";
  const route = text(body.route, 500) || "/games";
  if (!route.startsWith("/games")) return NextResponse.json({ ok: false }, { status: 400 });
  const componentName = text(body.componentName, 120) || "UnknownGameComponent";
  const fingerprint = createHash("sha256").update(`${text(body.errorType, 80)}:${componentName}:${message}`).digest("hex");
  const record = {
    game_id: text(body.gameSelected, 120) || null,
    severity: Number(body.retryCount || 0) >= 3 ? "error" : "warning",
    message,
    reported_by: "Todd Recovery",
    route,
    error_type: text(body.errorType, 80),
    component_name: componentName,
    component_stack: text(body.componentStack, 6000),
    retry_count: Math.max(0, Math.min(3, Math.floor(Number(body.retryCount) || 0))),
    browser: text(body.browser, 100),
    operating_system: text(body.os, 100),
    device_type: text(body.device, 100),
    diagnostics: { memory: body.memory || null, performance: body.performance || null, backgroundState: body.backgroundState || null, matrixState: body.matrixState || null, adminStatus: body.adminStatus || null, authenticationStatus: body.authenticationStatus || null },
    recovery_action: text(body.recoveryAction, 120),
    fingerprint
  };
  const saved = await fetch(`${service.url}/rest/v1/game_issue_reports`, { method: "POST", headers: serviceHeaders(service, "return=minimal"), body: JSON.stringify(record) }).catch(() => null);
  return NextResponse.json({ ok: true, stored: Boolean(saved?.ok) });
}

export async function GET(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  if (!admin || admin.role !== "ADMIN") return NextResponse.json({ ok: false }, { status: 401 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ ok: true, logs: [], configured: false });
  const response = await fetch(`${service.url}/rest/v1/game_issue_reports?select=*&order=created_at.desc&limit=200`, { cache: "no-store", headers: serviceHeaders(service) });
  const logs = response.ok ? await response.json() : [];
  return NextResponse.json({ ok: true, logs, configured: true });
}
