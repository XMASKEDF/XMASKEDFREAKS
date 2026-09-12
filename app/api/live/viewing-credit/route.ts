import { NextRequest, NextResponse } from "next/server";
import { consumeViewingCredit, readViewingCredit } from "@/lib/live/viewing-credit-server";

export const dynamic = "force-dynamic";

function validSessionId(value: unknown) {
  const id = String(value || "").trim();
  return /^[a-zA-Z0-9:_-]{8,160}$/.test(id) ? id : null;
}

export async function GET(request: NextRequest) {
  const result = await readViewingCredit(request, request.nextUrl.searchParams.get("environment") === "sandbox");
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const playbackSessionId = validSessionId(body.playbackSessionId);
  if (!playbackSessionId) return NextResponse.json({ ok: false, error: "Invalid playback session." }, { status: 400 });
  const result = await consumeViewingCredit(request, playbackSessionId, body.active === true, body.environment === "sandbox");
  return NextResponse.json({ ok: true, ...result });
}
