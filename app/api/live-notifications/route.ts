import { NextRequest, NextResponse } from "next/server";

type LiveNotificationRequest = {
  subject?: string;
  body?: string;
  cta?: string;
  destination?: string;
  language?: string;
  audience?: string;
  scheduledAt?: string;
  cooldownMinutes?: number;
  forceSend?: boolean;
};

const defaultMessage = "HURRY THEY'RE LIVE!!!!";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as LiveNotificationRequest));
  const streamActive = process.env.OBS_LIVE === "true" || process.env.NOTIFICATION_SANDBOX_STREAM_ACTIVE === "true";
  const idempotencyKey = request.headers.get("idempotency-key") || `live-${Date.now()}`;

  if (!streamActive) {
    return NextResponse.json({
      ok: false,
      blocked: true,
      reason: "Stream must be confirmed active before sending live notifications."
    }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    idempotencyKey,
    channel: "email",
    futureChannels: ["browser_push", "mobile_push", "sms"],
    campaign: {
      subject: body.subject || "XMASKEDFREAKS is live",
      body: body.body || defaultMessage,
      cta: body.cta || "Enter live",
      destination: body.destination || "/#live",
      language: body.language || "en",
      audience: body.audience || "All opted-in users",
      scheduledAt: body.scheduledAt || null,
      cooldownMinutes: body.cooldownMinutes || 90,
      unsubscribeRequired: true
    },
    deliveryEstimate: {
      eligibleUsers: 128,
      suppressedByOptOut: 7,
      duplicateSuppression: "per broadcast session unless forceSend is approved",
      savedToHistory: false
    }
  });
}
