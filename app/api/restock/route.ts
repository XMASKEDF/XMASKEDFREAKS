import { NextRequest, NextResponse } from "next/server";
import { getApiUser, serviceCredentials, serviceHeaders } from "@/lib/api-user";

export async function POST(request: NextRequest) {
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ error: "Restock notifications are unavailable." }, { status: 503 });
  const user = await getApiUser(request);
  const body = await request.json().catch(() => ({})) as { productId?: string; variantId?: string; email?: string; consent?: boolean };
  const email = String(user?.email || body.email || "").trim().toLowerCase().slice(0, 320);
  if (!body.consent || !body.productId || (!user && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return NextResponse.json({ error: "A signed-in account or valid email and notification consent are required." }, { status: 400 });
  const ownerFilter = user ? `user_id=eq.${user.id}` : `user_id=is.null&email=eq.${encodeURIComponent(email)}`;
  const variantFilter = body.variantId ? `variant_id=eq.${encodeURIComponent(body.variantId)}` : "variant_id=is.null";
  const existing = await fetch(`${service.url}/rest/v1/restock_requests?${ownerFilter}&product_id=eq.${encodeURIComponent(body.productId)}&${variantFilter}&fulfilled_at=is.null&unsubscribed_at=is.null&select=id&limit=1`, { headers: serviceHeaders(service) });
  if (existing.ok && (await existing.json() as unknown[]).length) return NextResponse.json({ ok: true, duplicate: true });

  const response = await fetch(`${service.url}/rest/v1/restock_requests`, {
    method: "POST",
    headers: serviceHeaders(service, "return=minimal"),
    body: JSON.stringify({ user_id: user?.id || null, email, product_id: body.productId, variant_id: body.variantId || null, consented_at: new Date().toISOString(), fulfilled_at: null, unsubscribed_at: null })
  });
  return response.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "This restock request could not be saved." }, { status: 422 });
}

export async function DELETE(request: NextRequest) {
  const service = serviceCredentials();
  const user = await getApiUser(request);
  if (!service || !user) return NextResponse.json({ error: "Sign in to unsubscribe." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { productId?: string; variantId?: string };
  const response = await fetch(`${service.url}/rest/v1/restock_requests?user_id=eq.${user.id}&product_id=eq.${encodeURIComponent(body.productId || "")}${body.variantId ? `&variant_id=eq.${encodeURIComponent(body.variantId)}` : ""}`, {
    method: "PATCH", headers: serviceHeaders(service, "return=minimal"), body: JSON.stringify({ unsubscribed_at: new Date().toISOString() })
  });
  return response.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Unsubscribe failed." }, { status: 422 });
}
