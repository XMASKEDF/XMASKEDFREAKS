import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getApiUser, serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { extractClientIp } from "@/lib/security";

export const dynamic = "force-dynamic";

type SessionRow = {
  playback_session_id: string;
  active_watch_seconds: number;
  pause_seconds: number;
  hidden_seconds: number;
  reconnect_count: number;
  contribution_coins: number;
  cumulative_tip_coins: number;
  qualifying_contribution_at: string | null;
};

function safeId(value: unknown, length = 160) {
  return String(value || "").trim().slice(0, length);
}

function anonymousHash(request: NextRequest, playbackSessionId: string) {
  return createHash("sha256").update(`${extractClientIp(request.headers)}:${request.headers.get("user-agent") || ""}:${playbackSessionId}:${process.env.ANALYTICS_HASH_SALT || "xmf-local"}`).digest("hex");
}

async function readSession(service: NonNullable<ReturnType<typeof serviceCredentials>>, playbackSessionId: string) {
  const response = await fetch(`${service.url}/rest/v1/live_viewer_sessions?playback_session_id=eq.${encodeURIComponent(playbackSessionId)}&select=playback_session_id,active_watch_seconds,pause_seconds,hidden_seconds,reconnect_count,contribution_coins,cumulative_tip_coins,qualifying_contribution_at&limit=1`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null);
  if (!response?.ok) return null;
  const [row] = await response.json().catch(() => []) as SessionRow[];
  return row || null;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = ["start", "heartbeat", "pause", "resume", "stop", "cutoff", "tip"].includes(String(body.action)) ? String(body.action) : "heartbeat";
  const playbackSessionId = safeId(body.playbackSessionId, 160);
  if (!/^[a-zA-Z0-9:_-]{8,160}$/.test(playbackSessionId)) return NextResponse.json({ ok: false, error: "Invalid playback session." }, { status: 400 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ ok: true, stored: false });
  const user = await getApiUser(request);
  const existing = await readSession(service, playbackSessionId);
  const incomingSeconds = Math.max(0, Math.min(2_147_000_000, Math.floor(Number(body.activeWatchSeconds || 0))));
  const environment = body.environment === "sandbox" ? "sandbox" : "production";
  const now = new Date().toISOString();

  if (!existing) {
    if (action !== "start" && action !== "resume") return NextResponse.json({ ok: true, stored: false });
    const createResponse = await fetch(`${service.url}/rest/v1/live_viewer_sessions`, {
      method: "POST",
      headers: serviceHeaders(service, "return=minimal"),
      body: JSON.stringify({
        playback_session_id: playbackSessionId,
        live_session_id: safeId(body.liveSessionId, 120) || "daily-live",
        live_input_id: safeId(body.liveInputId, 160) || null,
        user_id: user?.id || null,
        anonymous_session_hash: user ? null : anonymousHash(request, playbackSessionId),
        playback_started_at: now,
        active_watch_seconds: incomingSeconds,
        environment,
        last_heartbeat_at: now
      })
    }).catch(() => null);
    if (!createResponse?.ok) return NextResponse.json({ ok: true, stored: false });
  } else {
    const nextSeconds = Math.max(Number(existing.active_watch_seconds || 0), incomingSeconds);
    const patch: Record<string, unknown> = {
      active_watch_seconds: nextSeconds,
      pause_seconds: Math.max(Number(existing.pause_seconds || 0), Math.floor(Number(body.pauseSeconds || 0))),
      hidden_seconds: Math.max(Number(existing.hidden_seconds || 0), Math.floor(Number(body.hiddenSeconds || 0))),
      last_heartbeat_at: now,
      updated_at: now
    };
    if (action === "pause" || action === "cutoff" || action === "stop") patch.playback_stopped_at = now;
    if (action === "resume") patch.playback_stopped_at = null;
    if (action === "stop" || action === "cutoff") patch.route_exit_at = body.routeExit === true ? now : null;
    if (action === "resume") patch.reconnect_count = Number(existing.reconnect_count || 0) + 1;
    const updateResponse = await fetch(`${service.url}/rest/v1/live_viewer_sessions?playback_session_id=eq.${encodeURIComponent(playbackSessionId)}`, {
      method: "PATCH", headers: serviceHeaders(service, "return=minimal"), body: JSON.stringify(patch)
    }).catch(() => null);
    if (!updateResponse?.ok) return NextResponse.json({ ok: true, stored: false });
  }

  const latestSeconds = Math.max(Number(existing?.active_watch_seconds || 0), incomingSeconds);
  if (action !== "tip" && latestSeconds > 0) {
    const minuteIndex = Math.floor((latestSeconds - 1) / 60);
    const minuteSeconds = Math.min(60, latestSeconds - minuteIndex * 60);
    const buckets = [{ playback_session_id: playbackSessionId, minute_index: minuteIndex, active_seconds: minuteSeconds, environment, last_active_at: now, updated_at: now }];
    if (minuteIndex > 0) buckets.push({ playback_session_id: playbackSessionId, minute_index: minuteIndex - 1, active_seconds: 60, environment, last_active_at: now, updated_at: now });
    await fetch(`${service.url}/rest/v1/live_viewer_watch_minute_buckets?on_conflict=playback_session_id,minute_index`, {
      method: "POST",
      headers: serviceHeaders(service, "resolution=merge-duplicates,return=minimal"),
      body: JSON.stringify(buckets)
    }).catch(() => undefined);
  }

  if (action === "tip") {
    const transactionReference = safeId(body.transactionReference, 180);
    const coins = Math.max(0, Math.floor(Number(body.coinsTipped || 0)));
    if (transactionReference && coins > 0) {
      await fetch(`${service.url}/rest/v1/live_viewer_tip_correlations`, {
        method: "POST", headers: serviceHeaders(service, "resolution=ignore-duplicates,return=minimal"),
        body: JSON.stringify({ playback_session_id: playbackSessionId, transaction_reference: transactionReference, watch_seconds_before_tip: latestSeconds, watch_minute: Math.floor(latestSeconds / 60), coins_tipped: coins, qualifying: coins >= 10, environment })
      }).catch(() => undefined);
      await fetch(`${service.url}/rest/v1/live_viewer_sessions?playback_session_id=eq.${encodeURIComponent(playbackSessionId)}`, {
        method: "PATCH", headers: serviceHeaders(service, "return=minimal"),
        body: JSON.stringify({ contribution_coins: Math.max(Number(existing?.contribution_coins || 0), coins), cumulative_tip_coins: Number(existing?.cumulative_tip_coins || 0) + coins, qualifying_contribution_at: coins >= 10 ? now : existing?.qualifying_contribution_at || null, updated_at: now })
      }).catch(() => undefined);
    }
  }
  return NextResponse.json({ ok: true, stored: true });
}
