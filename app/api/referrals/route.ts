import { NextRequest, NextResponse } from "next/server";
import { normalizeReferralSource } from "@/lib/geo";

async function writeReferralEvent(payload: Record<string, unknown>) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return;

  await fetch(`${supabaseUrl}/rest/v1/referral_events`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=minimal"
    },
    body: JSON.stringify(payload)
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const referrerUrl = String(body.referrerUrl || request.headers.get("referer") || "");
  const campaignId = String(body.campaignId || "");
  const source = normalizeReferralSource(referrerUrl, campaignId);

  try {
    await writeReferralEvent({
      source,
      source_type: String(body.sourceType || "Automatic"),
      referrer_url: referrerUrl || null,
      landing_page: String(body.landingPage || "/"),
      session_id: String(body.sessionId || ""),
      campaign_id: campaignId || null,
      clicks: Math.max(1, Number(body.clicks || 1)),
      conversion_type: body.conversionType || null,
      conversion_action: body.conversionAction || null,
      revenue: Math.max(0, Number(body.revenue || 0)),
      session_duration_seconds: Math.max(0, Number(body.sessionDurationSeconds || 0)),
      bounced: Boolean(body.bounced),
      provider_name: body.providerName || "xmaskedfreaks",
      provider_event_id: body.providerEventId || null,
      metadata: body.metadata || {}
    });
  } catch {
    return NextResponse.json({ ok: false, source, message: "Referral detected but not stored." }, { status: 202 });
  }

  return NextResponse.json({ ok: true, source });
}
