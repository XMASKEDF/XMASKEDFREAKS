import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { getMaintenanceSettings } from "@/lib/maintenance";
import { GAME_ANTI_CHEAT, GAME_BOT_DETECTION, GAMEPLAY_BOT_CHALLENGE, GAME_REPLAY_PROTECTION, GAME_SCORE_VALIDATION, getStoredBotDetectionConfig } from "@/lib/infrastructure/bot-policy";
import { getSecurityEdgeSnapshot } from "@/lib/infrastructure/security-status";

export const dynamic = "force-dynamic";

async function rows(service: NonNullable<ReturnType<typeof serviceCredentials>>, path: string) {
  const response = await fetch(`${service.url}/rest/v1/${path}`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null);
  return response?.ok ? await response.json() as Array<Record<string, unknown>> : [];
}

export async function GET(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  if (!admin || !hasAdminPermission(admin, "admin.security.manage")) return NextResponse.json({ message: "Not found." }, { status: 404 });
  const service = serviceCredentials();
  const maintenance = await getMaintenanceSettings();
  const botConfig = await getStoredBotDetectionConfig();
  const edge = await getSecurityEdgeSnapshot();
  const protection = {
    gameBotDetection: GAME_BOT_DETECTION ? "ON" : "OFF",
    gameplayBotChallenges: GAMEPLAY_BOT_CHALLENGE ? "ON" : "OFF",
    gameAntiCheat: GAME_ANTI_CHEAT ? "ON" : "OFF",
    gameScoreValidation: GAME_SCORE_VALIDATION ? "ON" : "OFF",
    gameReplayProtection: GAME_REPLAY_PROTECTION ? "ON" : "OFF",
    globalBotProtection: botConfig.enabled ? botConfig.level.toUpperCase() : "OFF",
    botDetectionEnabled: botConfig.enabled ? "ON" : "OFF",
    botDetectionLevel: botConfig.level.toUpperCase(),
    botDetectionSupervisor: botConfig.supervisorAgentId
  };
  if (!service) {
    return NextResponse.json({ configured: false, maintenance, protection, edge, botReport: { supervisorAgentId: botConfig.supervisorAgentId, status: botConfig.enabled ? "ON" : "OFF", level: botConfig.level.toUpperCase(), thisHour: null, today: null, falsePositiveRateEstimated: null, customerInterruptions: null, topEndpoints: [], topPatterns: [], recommendation: "UNVERIFIED · Connect Supabase telemetry before evaluating Bot Detection behavior." }, metrics: {}, events: [], warnings: ["Production security telemetry is UNVERIFIED until Supabase service credentials are connected."] }, { headers: { "cache-control": "no-store" } });
  }
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [logins, securityEvents, audits, incidents, backups] = await Promise.all([
    rows(service, `admin_login_history?select=result,failure_reason,created_at&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=500`),
    rows(service, `security_events?select=action,reason,endpoint,abuse_score,country_code,created_at&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=500`),
    rows(service, "admin_audit_events?select=id,event_type,security_classification,success,created_at&order=created_at.desc&limit=100"),
    rows(service, "reliability_incidents?select=id,title,severity,status,feature,last_occurred_at&status=not.in.(Resolved,False Positive)&order=last_occurred_at.desc&limit=100"),
    rows(service, "reliability_backups?select=backup_type,status,started_at,completed_at,encrypted,retention_days,restore_tested_at,error_code&order=started_at.desc&limit=30")
  ]);
  const failedLogins = logins.filter((item) => item.result !== "success");
  const blocked = securityEvents.filter((item) => item.action === "blocked");
  const challengeEvents = securityEvents.filter((item) => String(item.action || "").includes("challenge"));
  const gameSecurityEvents = securityEvents.filter((item) => String(item.endpoint || "").startsWith("/api/games"));
  const authorizationFailures = securityEvents.filter((item) => String(item.reason || "").toLowerCase().includes("auth"));
  const hourSince = Date.now() - 60 * 60 * 1000;
  const botEvents = securityEvents.filter((item) => ["bot_observed", "bot_challenge_required", "bot_challenge_passed", "bot_challenge_failed"].includes(String(item.action)));
  const botEventsHour = botEvents.filter((item) => new Date(String(item.created_at)).getTime() >= hourSince);
  const challengeIssued = botEvents.filter((item) => item.action === "bot_challenge_required").length;
  const challengePassed = botEvents.filter((item) => item.action === "bot_challenge_passed").length;
  const customerInterruptions = challengeIssued + securityEvents.filter((item) => item.action === "rate_limited" && !String(item.endpoint || "").startsWith("/api/games/")).length;
  const endpointCounts = new Map<string, number>();
  const patternCounts = new Map<string, number>();
  for (const event of botEvents) { const endpoint = String(event.endpoint || "unknown"); endpointCounts.set(endpoint, (endpointCounts.get(endpoint) || 0) + 1); const pattern = String(event.reason || "bot signal").slice(0, 100); patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1); }
  const top = (values: Map<string, number>) => [...values.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, count]) => ({ label, count }));
  const falsePositiveRateEstimated = challengeIssued ? Math.round(challengePassed / challengeIssued * 100) : 0;
  const recommendation = falsePositiveRateEstimated >= 50 || customerInterruptions >= 20 ? "BOT DETECTION MAY BE TOO AGGRESSIVE · Review the rule, endpoint, and active level before changing policy." : "Customer-first posture is active. Sage reports observations; Admin retains policy decisions.";
  return NextResponse.json({
    configured: true,
    maintenance,
    protection,
    edge,
    metrics: {
      failedLogins24h: failedLogins.length,
      lockedAccounts24h: logins.filter((item) => item.result === "locked").length,
      blockedRequests24h: blocked.length,
      rateLimitEvents24h: securityEvents.filter((item) => item.action === "throttled").length,
      authorizationFailures24h: authorizationFailures.length,
      activeIncidents: incidents.length,
      criticalIncidents: incidents.filter((item) => Number(item.severity || 0) >= 4).length,
      paymentVerificationFailures: incidents.filter((item) => String(item.feature || "").includes("Payment")).length,
      walletAnomalies: incidents.filter((item) => String(item.feature || "").includes("Wallet")).length,
      uploadThreats: securityEvents.filter((item) => String(item.endpoint || "").includes("media") && Number(item.abuse_score || 0) >= 45).length
      , challengesIssued24h: challengeEvents.filter((item) => item.action === "bot_challenge_required").length
      , challengesPassed24h: challengeEvents.filter((item) => item.action === "bot_challenge_passed").length
      , challengesFailed24h: challengeEvents.filter((item) => item.action === "bot_challenge_failed").length
      , suspectedBots24h: botEvents.filter((item) => item.action === "bot_observed").length
      , customerInterruptions24h: customerInterruptions
      , estimatedFalsePositiveRate24h: falsePositiveRateEstimated
      , gameRelatedFalsePositives24h: gameSecurityEvents.filter((item) => item.action === "bot_challenge_required").length
      , gameSessionsTerminated24h: gameSecurityEvents.filter((item) => item.action === "game_session_terminated").length
    },
    events: [
      ...securityEvents.slice(0, 40).map((item) => ({ type: "request", severity: Number(item.abuse_score || 0) >= 75 ? "critical" : "warning", title: String(item.reason || item.action || "Security request"), detail: String(item.endpoint || ""), occurredAt: item.created_at })),
      ...audits.slice(0, 40).map((item) => ({ type: "admin", severity: item.security_classification === "critical" ? "critical" : "info", title: String(item.event_type || "Admin action"), detail: item.success === false ? "Failed" : "Completed", occurredAt: item.created_at })),
      ...incidents.slice(0, 40).map((item) => ({ type: "incident", severity: Number(item.severity || 0) >= 4 ? "critical" : "warning", title: String(item.title || "Reliability incident"), detail: String(item.feature || "Platform"), occurredAt: item.last_occurred_at }))
    ].sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt))).slice(0, 80),
    backups,
    botReport: { supervisorAgentId: botConfig.supervisorAgentId, status: botConfig.enabled ? "ON" : "OFF", level: botConfig.level.toUpperCase(), thisHour: { suspectedBots: botEventsHour.filter((item) => item.action === "bot_observed").length, challenges: botEventsHour.filter((item) => item.action === "bot_challenge_required").length, blocked: securityEvents.filter((item) => new Date(String(item.created_at)).getTime() >= hourSince && item.action === "blocked").length, rateLimited: securityEvents.filter((item) => new Date(String(item.created_at)).getTime() >= hourSince && item.action === "rate_limited").length, passedVerification: botEventsHour.filter((item) => item.action === "bot_challenge_passed").length }, today: { suspectedBots: botEvents.filter((item) => item.action === "bot_observed").length, challenges: challengeIssued, blocked: blocked.length, rateLimited: securityEvents.filter((item) => item.action === "rate_limited").length, passedVerification: challengePassed }, falsePositiveRateEstimated, customerInterruptions, topEndpoints: top(endpointCounts), topPatterns: top(patternCounts), recommendation },
    warnings: backups.length ? [] : ["Backup and restore status is UNVERIFIED because no provider evidence was returned."]
  }, { headers: { "cache-control": "no-store" } });
}
