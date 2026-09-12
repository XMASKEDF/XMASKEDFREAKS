import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { recordReliabilityIncident } from "@/lib/reliability/server";
import { cleanReliabilityText } from "@/lib/reliability/sanitize";
import { extractClientIp } from "@/lib/security";

const limits = new Map<string, { count: number; resetAt: number }>();
const allowedFeatures = new Set(["Browser", "Frontend", "Media", "Navigation", "Storage", "Live", "Games", "Accessibility", "Localization"]);

function rateLimited(key: string) {
  const now = Date.now();
  const current = limits.get(key);
  if (!current || current.resetAt <= now) {
    limits.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 20;
}

export async function POST(request: NextRequest) {
  const ipHash = createHash("sha256").update(`${extractClientIp(request.headers)}:${process.env.RELIABILITY_IP_SALT || "local-reliability"}`).digest("hex");
  if (rateLimited(ipHash)) return NextResponse.json({ ok: false }, { status: 429 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const feature = cleanReliabilityText(body.feature, 120);
  const route = cleanReliabilityText(body.route, 500);
  if (!allowedFeatures.has(feature) || (route && !route.startsWith("/"))) return NextResponse.json({ ok: false }, { status: 400 });
  const result = await recordReliabilityIncident({
    title: cleanReliabilityText(body.title, 200) || "Browser error",
    plainExplanation: "A visitor browser reported a problem. The affected feature was isolated where possible.",
    technicalExplanation: cleanReliabilityText(body.technicalExplanation, 2000),
    severity: Math.max(1, Math.min(4, Math.floor(Number(body.severity) || 2))) as 1 | 2 | 3 | 4,
    feature,
    affectedRoute: route,
    affectedCustomerCount: 1,
    browser: cleanReliabilityText(body.browser, 120),
    deviceType: cleanReliabilityText(body.deviceType, 120),
    operatingSystem: cleanReliabilityText(body.operatingSystem, 120),
    requestId: cleanReliabilityText(request.headers.get("x-request-id"), 160),
    errorMessage: cleanReliabilityText(body.message, 2000),
    sanitizedStack: cleanReliabilityText(body.stack, 8000),
    automaticResponse: cleanReliabilityText(body.automaticResponse, 1000) || "Captured and grouped; unaffected features remain active.",
    recoveryResult: cleanReliabilityText(body.recoveryResult, 1000),
    recommendedAdminAction: "Review recurrence, affected browsers, deployment version, and the isolated feature.",
    deploymentVersion: cleanReliabilityText(body.deploymentVersion, 160),
    metadata: {
      source: "browser",
      online: body.online,
      viewport: body.viewport,
      language: body.language,
      eventType: body.eventType
    }
  });
  return NextResponse.json({ ok: true, stored: result.stored, reference: result.correlationId });
}
