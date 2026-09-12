import { NextRequest, NextResponse } from "next/server";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ ok: false, error: "Earnings ledger is not configured." }, { status: 503 });
  const response = await fetch(`${service.url}/rest/v1/rpc/settle_admin_earnings`, { method: "POST", headers: serviceHeaders(service) });
  const result = await response.json().catch(() => ({}));
  return NextResponse.json({ ok: response.ok, settlement: result }, { status: response.ok ? 200 : 503 });
}
