import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession } from "@/lib/admin-auth";
import { extractClientIp } from "@/lib/security";
import { GAME_ANTI_CHEAT, GAME_BOT_DETECTION, GAMEPLAY_BOT_CHALLENGE, GAME_REPLAY_PROTECTION, GAME_SCORE_VALIDATION } from "@/lib/infrastructure/bot-policy";

const scenarios = new Set(["game_bot_attack", "bot_challenge", "impossible_score", "replay", "duplicate_submission"]);

export async function POST(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value).catch(() => null);
  if (!admin || admin.role !== "ADMIN") return NextResponse.json({ ok: false, error: "ADMIN access required." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { scenario?: unknown };
  const scenario = String(body.scenario || "");
  if (!scenarios.has(scenario)) return NextResponse.json({ ok: false, error: "Unknown security test scenario." }, { status: 400 });
  await auditAdminEvent({ adminUserId: admin.id, eventType: "game_security_simulation", ipAddress: extractClientIp(request.headers), userAgent: request.headers.get("user-agent") || "unknown", metadata: { scenario, gameBotDetection: GAME_BOT_DETECTION, gameAntiCheat: GAME_ANTI_CHEAT, gameScoreValidation: GAME_SCORE_VALIDATION, gameReplayProtection: GAME_REPLAY_PROTECTION, gameplayBotChallenges: GAMEPLAY_BOT_CHALLENGE } });
  return NextResponse.json({ ok: true, simulated: true, scenario, gameBotDetection: "OFF", gameplayBotChallenges: "OFF", gameAntiCheat: "ON", gameScoreValidation: "ON", gameReplayProtection: "ON", note: "Simulation only. No visitor session or production challenge state was changed." });
}
