import { NextRequest, NextResponse } from "next/server";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { getReliabilityCenterData } from "@/lib/reliability/health";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const service = serviceCredentials();
  const recipient = process.env.ADMIN_SUPPORT_EMAIL?.trim();
  if (!service || !recipient) {
    return NextResponse.json({ error: "Reliability summary delivery is not configured." }, { status: 503 });
  }
  const data = await getReliabilityCenterData();
  const reportDate = new Date().toISOString().slice(0, 10);
  const response = await fetch(`${service.url}/rest/v1/email_delivery_jobs`, {
    method: "POST",
    headers: serviceHeaders(service, "resolution=ignore-duplicates,return=minimal"),
    body: JSON.stringify({
      recipient_email: recipient,
      template_key: "reliability_daily",
      payload: {
        total: String(data.daily.total),
        active: String(data.daily.active),
        resolved: String(data.daily.resolved),
        critical: String(data.daily.critical),
        financial: String(data.daily.financial),
        affectedCustomers: String(data.daily.affectedCustomers)
      },
      related_entity_type: "reliability_daily_summary",
      related_entity_id: reportDate,
      idempotency_key: `reliability-daily:${reportDate}`
    })
  });
  if (!response.ok) return NextResponse.json({ error: "Daily reliability summary could not be queued." }, { status: 502 });
  return NextResponse.json({ ok: true, reportDate, status: data.overallStatus });
}
