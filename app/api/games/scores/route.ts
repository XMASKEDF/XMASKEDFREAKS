import { NextRequest, NextResponse } from "next/server";
import { defaultGames } from "@/lib/config";
import { gameServiceCredentials, getGamesEnabled } from "@/lib/games/catalog";
import { extractClientIp } from "@/lib/security";
import { adminSessionCookie, auditAdminEvent, getAdminBySession } from "@/lib/admin-auth";
import { getApiUser } from "@/lib/api-user";
import { evaluateRisk, recordRiskEvent } from "@/lib/risk";
import { validateGameResult } from "@/lib/games/anti-cheat";
import { getCacheProvider } from "@/lib/infrastructure/cache";
import { privateStateKey } from "@/lib/infrastructure/shared-state";
import { randomUUID } from "node:crypto";

export async function POST(request: NextRequest) {
  if (!await getGamesEnabled()) return NextResponse.json({ ok: false, error: "Games are currently unavailable." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const user = await getApiUser(request);
  const game = defaultGames.find((item) => item.id === String(body.gameId || ""));
  const score = Math.floor(Number(body.score));
  const sessionSeconds = Math.floor(Number(body.sessionSeconds));
  const displayName = String(body.displayName || "Player").replace(/[^a-z0-9_ -]/gi, "").trim().slice(0, 12) || "Player";
  const sessionId = String(body.sessionId || request.headers.get("idempotency-key") || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 80);
  const rawMetadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata as Record<string, unknown> : {};
  const metadata = Object.fromEntries(Object.entries(rawMetadata).slice(0, 16).flatMap(([key, value]) => {
    const safeKey = key.replace(/[^a-z0-9_-]/gi, "").slice(0, 40);
    if (!safeKey || !["string", "number", "boolean"].includes(typeof value)) return [];
    return [[safeKey, typeof value === "string" ? value.slice(0, 120) : value]];
  }));
  if (!game || !Number.isFinite(score) || score < 0 || score > 10_000_000 || !Number.isFinite(sessionSeconds) || sessionSeconds < 0 || sessionSeconds > 86_400) {
    return NextResponse.json({ ok: false, error: "Invalid score payload." }, { status: 400 });
  }
  if (!sessionId) return NextResponse.json({ ok: false, error: "Game session ID is required." }, { status: 400 });
  const antiCheat = validateGameResult({ gameId: game.id, score, sessionSeconds, metadata });
  if (!antiCheat.valid) {
    const decision = evaluateRisk({ action: "game_score_submission", score, durationSeconds: sessionSeconds, expectedMinimumSeconds: 1, suspiciousAutomation: true });
    void recordRiskEvent({ decision, action: "game_score_submission", environment: process.env.XMF_ENVIRONMENT || "LOCAL", userId: user?.id || null, metadata: { gameSessionId: sessionId, endpoint: "/api/games/scores", rule: antiCheat.reasons.join("; "), correlationId: randomUUID() } });
    return NextResponse.json({ ok: false, error: "Game result failed server validation.", code: "GAME_ANTICHEAT_REJECTED" }, { status: 422 });
  }
  const sessionKey = `${game.id}:${sessionId}`;
  const replayKey = await privateStateKey("game-score-replay", sessionKey);
  const cache = getCacheProvider();
  const replayToken = await cache.acquireLock(replayKey, 86_400);
  if (!replayToken) return NextResponse.json({ ok: true, persisted: false, duplicate: true });

  const service = gameServiceCredentials();
  if (!service) return NextResponse.json({ ok: true, persisted: false, note: "Local score saved; Supabase is not configured." });
  const response = await fetch(`${service.url}/rest/v1/game_scores?on_conflict=session_id`, {
    method: "POST",
    headers: { apikey: service.key, authorization: `Bearer ${service.key}`, "content-type": "application/json", prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ game_id: game.id, game_title: game.title, user_id: user?.id || null, display_name: displayName, score, session_seconds: sessionSeconds, session_id: sessionId, difficulty: typeof metadata.difficulty === "string" ? metadata.difficulty : null, round_level: typeof metadata.wave === "number" ? Math.floor(metadata.wave) : typeof metadata.level === "number" ? Math.floor(metadata.level) : null, metadata })
  }).catch(() => null);
  if (!response?.ok) await cache.releaseLock(replayKey, replayToken);
  return NextResponse.json({ ok: Boolean(response?.ok), persisted: Boolean(response?.ok) }, { status: response?.ok ? 200 : 503 });
}

export async function GET(request: NextRequest) {
  if (!await getGamesEnabled()) return NextResponse.json({ ok: false, error: "Games are currently unavailable." }, { status: 503 });
  const gameId = (request.nextUrl.searchParams.get("gameId") || "").replace(/[^a-z0-9_-]/gi, "");
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 25)));
  const service = gameServiceCredentials();
  if (!service || !defaultGames.some((game) => game.id === gameId)) return NextResponse.json({ ok: true, leaderboard: [] });
  const response = await fetch(`${service.url}/rest/v1/game_scores?game_id=eq.${gameId}&select=display_name,score,difficulty,round_level,created_at&order=score.desc,created_at.asc&limit=${limit}`, { cache: "no-store", headers: { apikey: service.key, authorization: `Bearer ${service.key}` } }).catch(() => null);
  return NextResponse.json({ ok: Boolean(response?.ok), leaderboard: response?.ok ? await response.json() : [] }, { status: response?.ok ? 200 : 503 });
}

export async function DELETE(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value).catch(() => null);
  if (!admin || admin.role !== "ADMIN") return NextResponse.json({ ok: false, error: "ADMIN access required." }, { status: 403 });
  const service = gameServiceCredentials();
  if (!service) return NextResponse.json({ ok: true, persisted: false, note: "No server leaderboard is configured." });
  const response = await fetch(`${service.url}/rest/v1/game_scores?game_id=not.is.null`, {
    method: "DELETE",
    headers: { apikey: service.key, authorization: `Bearer ${service.key}`, prefer: "return=minimal" }
  }).catch(() => null);
  await auditAdminEvent({
    adminUserId: admin.id,
    eventType: "game_leaderboards_reset",
    ipAddress: extractClientIp(request.headers),
    userAgent: request.headers.get("user-agent") || "unknown",
    metadata: { success: Boolean(response?.ok) }
  });
  return NextResponse.json({ ok: Boolean(response?.ok) }, { status: response?.ok ? 200 : 503 });
}
