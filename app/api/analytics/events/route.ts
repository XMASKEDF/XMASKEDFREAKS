import { createHash, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getApiUser, serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { extractClientIp } from "@/lib/security";

const allowedEvents = new Set(["page_view", "product_view", "add_to_cart", "checkout_started", "purchase_completed", "download", "notification_opened", "live_page_visit", "live_playback_start", "live_playback_stop", "live_playback_resume", "live_route_exit_stop", "live_background_pause", "live_video_never_started", "live_active_watch", "live_unpaid_cutoff", "live_viewing_credit_empty", "live_viewing_credit_resume", "live_contribution_first_reminder_impression", "live_contribution_first_reminder_tip_now", "live_contribution_first_reminder_buy_coins", "live_contribution_first_reminder_dismissal", "live_contribution_second_reminder_impression", "live_contribution_second_reminder_tip_now", "live_contribution_second_reminder_buy_coins", "live_contribution_second_reminder_dismissal", "live_contribution_qualified_before_cutoff", "live_contribution_unpaid_cutoff", "live_hourly_credit_reminder", "live_contribution_post_cutoff", "live_contribution_redirect_initiated", "live_contribution_redirect_cancelled", "live_contribution_checkout_after_cutoff", "live_quick_tip_opened", "live_quick_tip_selected", "live_quick_tip_payment_initiated", "live_quick_tip_payment_cancelled", "live_quick_tip_payment_failed"]);
const rates = new Map<string, { count: number; expires: number }>();
function safe(value: unknown, length = 160) { return String(value || "").normalize("NFKC").replace(/[^\p{L}\p{N}\s/_:.-]/gu, "").slice(0, length); }
function safeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 12).map(([key, item]) => [safe(key, 40), typeof item === "string" ? safe(item, 160) : typeof item === "number" || typeof item === "boolean" ? item : null]));
}

export async function POST(request: NextRequest) {
  const ip = extractClientIp(request.headers); const now = Date.now(); const rate = rates.get(ip);
  if (rates.size > 5_000) for (const [key, value] of rates) if (value.expires < now) rates.delete(key);
  if (!rate || rate.expires < now) rates.set(ip, { count: 1, expires: now + 60_000 });
  else if (++rate.count > 120) return NextResponse.json({ error: "Rate limited." }, { status: 429 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const eventType = safe(body.eventType, 40);
  if (!allowedEvents.has(eventType)) return NextResponse.json({ error: "Unsupported event." }, { status: 400 });
  const service = serviceCredentials(); if (!service) return NextResponse.json({ ok: true, stored: false });
  const user = await getApiUser(request);
  const sessionHash = createHash("sha256").update(`${ip}:${request.headers.get("user-agent") || ""}:${process.env.ANALYTICS_HASH_SALT || "xmf-local"}`).digest("hex");
  const response = await fetch(`${service.url}/rest/v1/analytics_events`, { method: "POST", headers: serviceHeaders(service, "return=minimal"), body: JSON.stringify({
    event_type: eventType, event_key: safe(body.eventKey, 100) || randomUUID(), anonymous_session_hash: sessionHash, user_id: user?.id || null,
    page_path: safe(body.pagePath, 300), content_type: safe(body.contentType, 60) || null, content_id: safe(body.contentId, 160) || null,
    language_code: safe(body.languageCode, 20) || null, device_type: safe(body.deviceType, 30) || null,
    referrer_host: safe(body.referrerHost, 180) || null,
    source: safe(body.source, 80) || null,
    medium: safe(body.medium, 80) || null,
    campaign: safe(body.campaign, 120) || null,
    content: safe(body.content, 120) || null,
    landing_page: safe(body.landingPage, 300) || null,
    environment: body.environment === "sandbox" ? "sandbox" : "production",
    metadata: safeMetadata(body.metadata)
  }) });
  return response.ok ? NextResponse.json({ ok: true, stored: true }) : NextResponse.json({ ok: true, stored: false });
}
