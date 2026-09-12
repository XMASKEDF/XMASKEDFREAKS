import { NextRequest, NextResponse } from "next/server";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const secret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const service = serviceCredentials(); if (!service) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const headers = serviceHeaders(service); const now = new Date().toISOString();
  const retentionDays = Math.max(30, Math.min(730, Number(process.env.ANALYTICS_RETENTION_DAYS || 180)));
  const retention = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
  const [reservations, policies, analytics] = await Promise.all([
    fetch(`${service.url}/rest/v1/inventory_reservations?expires_at=lte.${now}&consumed_at=is.null&released_at=is.null`, { method: "PATCH", headers, body: JSON.stringify({ released_at: now }) }),
    fetch(`${service.url}/rest/v1/policy_versions?status=eq.scheduled&publish_at=lte.${now}`, { method: "PATCH", headers, body: JSON.stringify({ status: "published", published_at: now, effective_at: now }) }),
    fetch(`${service.url}/rest/v1/analytics_events?occurred_at=lt.${retention}`, { method: "DELETE", headers })
  ]);
  return NextResponse.json({ reservationCleanup: reservations.ok, policyPublishing: policies.ok, analyticsRetention: analytics.ok, timestamp: now });
}
