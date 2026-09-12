import { NextRequest, NextResponse } from "next/server";
import { updateLiveViewerPresence } from "@/lib/live/managed-viewers-server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { visitorKey?: unknown; tabId?: unknown; action?: unknown };
  const visitorKey = typeof body.visitorKey === "string" ? body.visitorKey.trim().slice(0, 160) : "";
  const tabId = typeof body.tabId === "string" ? body.tabId.trim().slice(0, 160) : "";
  const action = body.action === "heartbeat" || body.action === "leave" ? body.action : body.action === "join" ? "join" : null;
  if (!visitorKey || !tabId || !action) return NextResponse.json({ ok: false, error: "Invalid presence event." }, { status: 400 });
  const result = await updateLiveViewerPresence({ visitorKey, tabId, action });
  return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store, private" } });
}
