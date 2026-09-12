import { NextResponse } from "next/server";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";

export const dynamic = "force-dynamic";

export async function GET() {
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ events: [] });
  const response = await fetch(`${service.url}/rest/v1/public_live_tip_events?select=id,public_display_name,tip_coins,approved_message,created_at&order=created_at.desc&limit=20`, {
    cache: "no-store",
    headers: serviceHeaders(service)
  }).catch(() => null);
  const rows = response?.ok ? await response.json() as Array<Record<string, unknown>> : [];
  return NextResponse.json({
    events: rows.map((row) => ({
      id: String(row.id), displayName: String(row.public_display_name || "Guest"),
      coins: Math.max(1, Number(row.tip_coins || 1)),
      message: String(row.approved_message || ""), createdAt: String(row.created_at)
    }))
  }, { headers: { "Cache-Control": "no-store, private" } });
}
