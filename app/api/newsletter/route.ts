import { NextRequest, NextResponse } from "next/server";
import { getApiUser, serviceCredentials, serviceHeaders } from "@/lib/api-user";

export const runtime = "nodejs";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ ok: false, error: "Newsletter signup is temporarily unavailable." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = body.action === "unsubscribe" ? "unsubscribe" : "subscribe";
  const email = String(body.email || "").trim().toLowerCase().slice(0, 320);
  if (!emailPattern.test(email)) return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 422 });
  const user = await getApiUser(request);
  const base = { email, user_id: user?.id || null, language_code: String(body.language || "en").slice(0, 16), source: String(body.source || "newsletter_popup").slice(0, 80), updated_at: new Date().toISOString() };
  const existingResponse = await fetch(`${service.url}/rest/v1/newsletter_subscribers?email=eq.${encodeURIComponent(email)}&select=id&limit=1`, { headers: serviceHeaders(service) });
  const existing = existingResponse.ok ? await existingResponse.json() as Array<{ id: string }> : [];
  const payload = action === "subscribe" ? { ...base, consent_status: "subscribed", subscribed_at: new Date().toISOString(), unsubscribed_at: null } : { ...base, consent_status: "unsubscribed", unsubscribed_at: new Date().toISOString() };
  const response = await fetch(existing[0] ? `${service.url}/rest/v1/newsletter_subscribers?id=eq.${encodeURIComponent(existing[0].id)}` : `${service.url}/rest/v1/newsletter_subscribers`, {
    method: existing[0] ? "PATCH" : "POST",
    headers: serviceHeaders(service, "return=minimal"),
    body: JSON.stringify(payload)
  });
  if (!response.ok) return NextResponse.json({ ok: false, error: "Your preference could not be saved." }, { status: 422 });
  return NextResponse.json({ ok: true, action });
}
