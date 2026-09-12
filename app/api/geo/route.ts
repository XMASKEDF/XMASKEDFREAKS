import { createHash, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

function hashIp(value: string) {
  return createHash("sha256")
    .update(`${process.env.GEO_IP_HASH_SALT || "local-dev-salt"}:${value}`)
    .digest("hex");
}

function parseDevice(userAgent: string) {
  const mobile = /Mobile|Android|iPhone/i.test(userAgent);
  const tablet = /iPad|Tablet/i.test(userAgent);
  const browser = /Firefox/i.test(userAgent) ? "Firefox"
    : /Edg/i.test(userAgent) ? "Edge"
      : /Safari/i.test(userAgent) && !/Chrome/i.test(userAgent) ? "Safari"
        : /Chrome/i.test(userAgent) ? "Chrome"
          : "Unknown";
  const operatingSystem = /Windows/i.test(userAgent) ? "Windows"
    : /Mac OS/i.test(userAgent) ? "macOS"
      : /Android/i.test(userAgent) ? "Android"
        : /iPhone|iPad/i.test(userAgent) ? "iOS"
          : "Unknown";

  return {
    browser,
    operatingSystem,
    deviceType: tablet ? "Tablet" : mobile ? "Mobile" : "Desktop"
  };
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const forwardedFor = request.headers.get("x-forwarded-for") || "";
  const rawIp = forwardedFor.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "0.0.0.0";
  const userAgent = request.headers.get("user-agent") || "";
  const countryCode = request.headers.get("cf-ipcountry") || body.countryCode || "XX";
  const device = parseDevice(userAgent);

  const event = {
    sessionId: body.sessionId || randomUUID(),
    ipHash: hashIp(rawIp),
    countryCode,
    region: body.region || null,
    city: body.city || null,
    timeZone: body.timeZone || "America/Chicago",
    language: body.language || request.headers.get("accept-language")?.split(",")[0] || "en",
    referralSource: body.referralSource || request.headers.get("referer") || "Direct",
    campaignId: body.campaignId || null,
    currentPage: body.currentPage || "/",
    device,
    returning: Boolean(body.returning),
    createdAt: new Date().toISOString()
  };

  return NextResponse.json({
    ok: true,
    stored: false,
    privacy: "Raw IP is hashed for analytics and omitted from this response. Connect a server-side geolocation provider plus Supabase service role storage for production.",
    event
  });
}
