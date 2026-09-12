import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession } from "@/lib/admin-auth";
import { gameServiceCredentials } from "@/lib/games/catalog";
import { DEFAULT_GAME_TUNING, normalizeGameTuning } from "@/lib/games/settings";
import { extractClientIp } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET() {
  const service = gameServiceCredentials();
  if (!service) return NextResponse.json({ settings: DEFAULT_GAME_TUNING, persisted: false });
  const response = await fetch(`${service.url}/rest/v1/game_runtime_settings?id=eq.default&select=settings&limit=1`, {
    cache: "no-store",
    headers: { apikey: service.key, authorization: `Bearer ${service.key}` }
  }).catch(() => null);
  if (!response?.ok) return NextResponse.json({ settings: DEFAULT_GAME_TUNING, persisted: false });
  const rows = await response.json() as Array<{ settings?: Partial<typeof DEFAULT_GAME_TUNING> }>;
  return NextResponse.json({ settings: normalizeGameTuning(rows[0]?.settings), persisted: Boolean(rows[0]) });
}

export async function POST(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value).catch(() => null);
  if (!admin || admin.role !== "ADMIN") return NextResponse.json({ ok: false, error: "ADMIN access required." }, { status: 403 });
  const service = gameServiceCredentials();
  if (!service) return NextResponse.json({ ok: false, error: "Production settings storage is not configured." }, { status: 503 });
  const settings = normalizeGameTuning(await request.json().catch(() => ({})));
  const response = await fetch(`${service.url}/rest/v1/game_runtime_settings?on_conflict=id`, {
    method: "POST",
    headers: { apikey: service.key, authorization: `Bearer ${service.key}`, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: "default", settings, updated_by: admin.id, updated_at: new Date().toISOString() })
  }).catch(() => null);
  await auditAdminEvent({ adminUserId: admin.id, eventType: "game_runtime_settings_updated", ipAddress: extractClientIp(request.headers), userAgent: request.headers.get("user-agent") || "unknown", metadata: { success: Boolean(response?.ok), gamesEnabled: settings.gamesEnabled } });
  return NextResponse.json({ ok: Boolean(response?.ok), settings }, { status: response?.ok ? 200 : 503 });
}
