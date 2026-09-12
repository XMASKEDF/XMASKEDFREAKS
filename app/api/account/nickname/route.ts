import { NextRequest, NextResponse } from "next/server";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { validateNickname } from "@/lib/account/nickname";
import { extractClientIp } from "@/lib/security";

export const dynamic = "force-dynamic";

const checks = new Map<string, { count: number; resetAt: number }>();

export async function GET(request: NextRequest) {
  const ip = extractClientIp(request.headers);
  const now = Date.now();
  const limit = checks.get(ip);
  if (!limit || limit.resetAt < now) checks.set(ip, { count: 1, resetAt: now + 60_000 });
  else {
    limit.count += 1;
    if (limit.count > 40) return NextResponse.json({ available: false, code: "RATE_LIMITED", message: "Wait a moment before checking again." }, { status: 429 });
  }

  const validation = validateNickname(request.nextUrl.searchParams.get("value") || "");
  if (!validation.valid) return NextResponse.json({ available: false, ...validation });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ available: true, ...validation, unverified: true });
  const response = await fetch(`${service.url}/rest/v1/rpc/nickname_available`, {
    method: "POST",
    cache: "no-store",
    headers: serviceHeaders(service),
    body: JSON.stringify({ candidate: validation.normalized })
  }).catch(() => null);
  if (!response?.ok) return NextResponse.json({ available: false, code: "CHECK_UNAVAILABLE", message: "Availability could not be verified." }, { status: 503 });
  const available = await response.json() as boolean;
  return NextResponse.json({
    available,
    normalized: validation.normalized,
    code: available ? "AVAILABLE" : "TAKEN",
    message: available ? "Available" : "Already taken"
  });
}
