import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getApiUser, serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { cleanFeetText } from "@/lib/feet/types";
import { getFeetPresets } from "@/lib/feet/server";

export const dynamic = "force-dynamic";

const limits = new Map<string, { count: number; resetAt: number }>();

function limited(key: string) {
  const now = Date.now();
  const current = limits.get(key);
  if (!current || current.resetAt < now) { limits.set(key, { count: 1, resetAt: now + 60_000 }); return false; }
  current.count += 1;
  return current.count > 20;
}

export async function GET() {
  const data = await getFeetPresets(false);
  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return NextResponse.json({ ok: false, code: "AUTH_REQUIRED", message: "Sign in before submitting a Feet Request." }, { status: 401 });
  if (limited(user.id)) return NextResponse.json({ ok: false, code: "RATE_LIMITED", message: "Too many requests. Please wait a moment." }, { status: 429 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ ok: false, code: "REQUESTS_UNAVAILABLE", message: "Feet Requests are not connected yet." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const presetId = String(body.presetId || "").trim();
  const idempotencyKey = String(request.headers.get("idempotency-key") || body.idempotencyKey || "").trim().slice(0, 120);
  const requestDetails = cleanFeetText(body.requestDetails, 1000);
  if (!presetId || !idempotencyKey) return NextResponse.json({ ok: false, code: "INVALID_REQUEST", message: "Choose a request and try again." }, { status: 400 });
  const presetResponse = await fetch(`${service.url}/rest/v1/feet_request_presets?id=eq.${encodeURIComponent(presetId)}&status=eq.ACTIVE&select=id`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null);
  if (!presetResponse?.ok || !(await presetResponse.json().catch(() => []) as unknown[]).length) return NextResponse.json({ ok: false, code: "PRESET_UNAVAILABLE", message: "That request is no longer available." }, { status: 409 });
  const response = await fetch(`${service.url}/rest/v1/rpc/create_feet_request`, {
    method: "POST",
    headers: serviceHeaders(service),
    body: JSON.stringify({ p_user_id: user.id, p_preset_id: presetId, p_request_details: requestDetails, p_idempotency_key: idempotencyKey })
  }).catch(() => null);
  if (!response?.ok) {
    const detail = await response?.text().catch(() => "") || "";
    const code = detail.includes("INSUFFICIENT_TOKENS") ? "INSUFFICIENT_TOKENS" : detail.includes("PRESET_UNAVAILABLE") ? "PRESET_UNAVAILABLE" : "REQUEST_FAILED";
    return NextResponse.json({ ok: false, code, message: code === "INSUFFICIENT_TOKENS" ? "You do not have enough coins for this request." : "The request was not created. No coins were deducted." }, { status: code === "INSUFFICIENT_TOKENS" ? 409 : 422 });
  }
  const result = await response.json() as Record<string, unknown>;
  return NextResponse.json({ ok: true, request: result, tokenBalance: result.tokenBalance || result.token_balance || null, duplicate: result.duplicate === true });
}
