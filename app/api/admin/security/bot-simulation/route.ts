import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";
import { botPolicyForLevel, normalizeBotDetectionLevel, type BotDetectionLevel } from "@/lib/infrastructure/bot-policy";
import { evaluateSecurityRequest } from "@/lib/security";

const scenarios = new Set(["normal_customer", "international_customer", "fast_browsing_customer", "obvious_bot", "brute_force_bot", "api_flood", "challenge_pass", "challenge_failure"]);
const labels: Record<string, string> = {
  normal_customer: "Normal customer",
  international_customer: "International customer",
  fast_browsing_customer: "Fast legitimate visitor",
  obvious_bot: "Obvious bot",
  brute_force_bot: "Brute-force bot",
  api_flood: "API flood",
  challenge_pass: "Challenge pass",
  challenge_failure: "Challenge failure"
};

export async function POST(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value).catch(() => null);
  if (!admin || !hasAdminPermission(admin, "admin.security.manage")) return NextResponse.json({ ok: false, error: "ADMIN security access required." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { scenario?: unknown; level?: unknown };
  const scenario = String(body.scenario || "");
  if (!scenarios.has(scenario)) return NextResponse.json({ ok: false, error: "Unknown Bot Detection sandbox scenario." }, { status: 400 });
  const level = normalizeBotDetectionLevel(body.level);
  const policy = botPolicyForLevel(level);
  const base = { ip: "198.51.100.20", country: "US", userAgent: "Mozilla/5.0", pathname: "/", method: "GET", requestCount: 3, failedAuthCount: 0, contentLength: 0, query: "", botDetectionEnabled: true, botDetectionLevel: level as BotDetectionLevel };
  const input = scenario === "international_customer" ? { ...base, country: "DE" }
    : scenario === "fast_browsing_customer" ? { ...base, requestCount: Math.max(12, Math.floor(policy.requestSoftLimit / 2)) }
      : scenario === "obvious_bot" ? { ...base, userAgent: "python-requests", requestCount: policy.requestHardLimit + 10, query: "?q=../../.env" }
        : scenario === "brute_force_bot" ? { ...base, pathname: "/admin/login", failedAuthCount: policy.failedAttempts + 2 }
          : scenario === "api_flood" ? { ...base, pathname: "/api/support", requestCount: policy.requestHardLimit + 10 }
            : base;
  const decision = evaluateSecurityRequest(input);
  const challenge = scenario === "challenge_pass" ? "PASSED" : scenario === "challenge_failure" ? "FAILED" : "NOT_REQUIRED";
  const action = scenario === "challenge_pass" ? "allow" : scenario === "challenge_failure" ? "challenge" : decision.action;
  return NextResponse.json({ ok: true, sandbox: true, scenario, scenarioLabel: labels[scenario], level, action, score: decision.score, challenge, reasons: decision.reasons, note: "Simulation only. No production visitor, challenge, block, account, payment, or game state was changed." });
}
