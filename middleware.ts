import { NextRequest, NextResponse } from "next/server";
import {
  evaluateSecurityRequest,
  extractClientIp,
  parseSecurityList
} from "@/lib/security";
import { isKillSwitchRouteBlocked, type MaintenancePolicySettings } from "@/lib/maintenance-policy";
import { isSameOriginRequest, requestBodyLimit } from "@/lib/security/request";
import { isAdminDevAuthEnabled } from "@/lib/admin-dev-bypass";
import { checkRateLimit, ruleForPath } from "@/lib/infrastructure/rate-limit";
import { getBotProtectionProvider } from "@/lib/infrastructure/bot-protection-edge";
import { botPolicyForLevel, getStoredBotDetectionConfig, isActiveGameplayRoute, isGameRoute, isTurnstileCandidateRoute } from "@/lib/infrastructure/bot-policy";

type EdgeMaintenanceState = MaintenancePolicySettings & { expiresAt: number };
const inactiveMaintenance: MaintenancePolicySettings = { enabled: false, scope: "full", disabledSystems: [] };
let maintenanceCache: EdgeMaintenanceState | null = null;

function contentSecurityPolicy(nonce: string) {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss:",
    "frame-src https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ];
  if (process.env.NODE_ENV === "production") directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

function secureResponse(response: NextResponse, nonce: string, privateRoute = false, requestId?: string) {
  response.headers.set("content-security-policy", contentSecurityPolicy(nonce));
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(self), usb=(), serial=()");
  response.headers.set("cross-origin-opener-policy", "same-origin-allow-popups");
  response.headers.set("cross-origin-resource-policy", "same-site");
  if (requestId) response.headers.set("x-request-id", requestId);
  response.headers.set("x-frame-options", "DENY");
  if (process.env.NODE_ENV === "production") response.headers.set("strict-transport-security", "max-age=31536000; includeSubDomains; preload");
  if (privateRoute) {
    response.headers.set("cache-control", "no-store, private");
    response.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  }
  return response;
}

async function maintenanceState() {
  if (maintenanceCache && maintenanceCache.expiresAt > Date.now()) return maintenanceCache;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ...inactiveMaintenance, expiresAt: Date.now() + 2_000 };
  const response = await fetch(`${url}/rest/v1/maintenance_settings?id=eq.primary&select=*&limit=1`, { cache: "no-store", headers: { apikey: key, authorization: `Bearer ${key}` } }).catch(() => null);
  const rows = response?.ok ? await response.json().catch(() => null) as Array<Record<string, unknown>> | null : null;
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!response?.ok || !row) {
    // A configured but unreachable state store must not silently reopen the
    // public site after an emergency activation.
    maintenanceCache = maintenanceCache?.enabled
      ? { ...maintenanceCache, expiresAt: Date.now() + 2_000 }
      : { enabled: true, scope: "full", disabledSystems: [], expiresAt: Date.now() + 2_000 };
    return maintenanceCache;
  }
  maintenanceCache = {
    enabled: row?.enabled === true,
    scope: ["full", "checkout", "live", "commerce", "selected"].includes(String(row?.scope)) ? String(row?.scope) as MaintenancePolicySettings["scope"] : "full",
    disabledSystems: Array.isArray(row?.disabled_systems) ? row.disabled_systems.map(String) : [],
    expiresAt: Date.now() + 2_000
  };
  return maintenanceCache;
}

async function logSecurityEvent(input: {
  ipAddress: string;
  countryCode: string;
  userAgent: string;
  endpoint: string;
  reason: string;
  action: string;
  score: number;
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return;

  try {
    await fetch(`${supabaseUrl}/rest/v1/security_events`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        prefer: "return=minimal"
      },
      body: JSON.stringify({
        ip_address: input.ipAddress,
        country_code: input.countryCode,
        user_agent: input.userAgent,
        endpoint: input.endpoint,
        reason: input.reason,
        action: input.action,
        abuse_score: input.score,
        provider: "next-middleware"
      })
    });
  } catch {
    // Security enforcement must not fail open because logging is unavailable.
  }
}

function readCookieCount(request: NextRequest, key: string) {
  return Math.max(0, Number(request.cookies.get(key)?.value || 0));
}

function requestCorrelationId(request: NextRequest) {
  const incoming = request.headers.get("x-request-id")?.trim() || "";
  return /^[A-Za-z0-9._:-]{1,128}$/.test(incoming) ? incoming : crypto.randomUUID();
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const gameRoute = isGameRoute(pathname);
  const activeGameplayRoute = isActiveGameplayRoute(pathname);
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const requestId = requestCorrelationId(request);
  const publicAdminEndpoints = [
    "/admin/login",
    "/admin/setup",
    "/admin/verify",
    "/admin/reset-password",
    "/api/admin/login",
    "/api/admin/setup",
    "/api/admin/verify",
    "/api/admin/password-reset"
  ];
  const isPublicAdminEndpoint = publicAdminEndpoints.some((path) => pathname === path);
  const isAdminPage = pathname.startsWith("/admin") || pathname === "/sandbox";
  const isAdminApi = pathname.startsWith("/api/admin");
  const developmentAdminAccess = isAdminDevAuthEnabled();

  if (isAdminPage && !isPublicAdminEndpoint && !developmentAdminAccess && !request.cookies.get("xmf_admin_session")?.value) {
    return secureResponse(NextResponse.redirect(new URL("/admin/login", request.url)), nonce, true, requestId);
  }
  if (isAdminApi && !isPublicAdminEndpoint && !developmentAdminAccess && !request.cookies.get("xmf_admin_session")?.value) {
    return secureResponse(NextResponse.json({ message: "Not found." }, { status: 404 }), nonce, true, requestId);
  }
  if (pathname.startsWith("/api/") && !isSameOriginRequest({ method: request.method, pathname, origin: request.nextUrl.origin, originHeader: request.headers.get("origin"), refererHeader: request.headers.get("referer"), fetchSite: request.headers.get("sec-fetch-site") })) {
    return secureResponse(NextResponse.json({ message: "Request rejected." }, { status: 403 }), nonce, isAdminApi, requestId);
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > requestBodyLimit(pathname)) {
    return secureResponse(NextResponse.json({ message: "Payload too large." }, { status: 413 }), nonce, isAdminApi, requestId);
  }

  const maintenance = await maintenanceState();
  if (isKillSwitchRouteBlocked(maintenance, pathname)) {
    if (pathname.startsWith("/api/")) return secureResponse(NextResponse.json({ code: "KILL_SWITCH_ACTIVE", message: "This service is temporarily unavailable." }, { status: 503, headers: { "retry-after": "60", "cache-control": "no-store" } }), nonce, false, requestId);
    return secureResponse(NextResponse.rewrite(new URL("/kill-switch", request.url)), nonce, false, requestId);
  }

  const ipAddress = extractClientIp(request.headers);
  const countryCode = request.headers.get("cf-ipcountry") || request.headers.get("x-vercel-ip-country") || "";
  const userAgent = request.headers.get("user-agent") || "";
  const requestCount = readCookieCount(request, "xmf_req_count") + 1;
  const failedAuthCount = readCookieCount(request, "xmf_failed_auth");
  const botConfig = await getStoredBotDetectionConfig();
  const gameplayBotSignalsEnabled = botConfig.enabled && !activeGameplayRoute;

  const decision = evaluateSecurityRequest({
    ip: ipAddress,
    country: countryCode,
    userAgent,
    pathname: request.nextUrl.pathname,
    method: request.method,
    requestCount,
    failedAuthCount,
    contentLength,
    query: request.nextUrl.search,
    whitelistedIps: parseSecurityList(process.env.SECURITY_WHITELIST_IPS),
    blacklistedIps: parseSecurityList(process.env.SECURITY_BLACKLIST_IPS),
    blacklistedCountries: parseSecurityList(process.env.SECURITY_BLACKLIST_COUNTRIES),
    blacklistedUserAgents: parseSecurityList(process.env.SECURITY_BLACKLIST_USER_AGENTS),
    botDetectionEnabled: gameplayBotSignalsEnabled,
    botDetectionLevel: botConfig.level
  });

  const rateRule = pathname.startsWith("/api/") ? ruleForPath(pathname, request.method) : null;
  if (rateRule) {
    const rate = await checkRateLimit(rateRule, ipAddress);
    if (!rate.allowed) {
      await logSecurityEvent({ ipAddress, countryCode, userAgent, endpoint: pathname, reason: `Rate limit exceeded: ${rateRule.name}`, action: "rate_limited", score: 6 });
      return secureResponse(NextResponse.json({ code: "RATE_LIMITED", message: "Too many requests. Please try again later." }, { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds), "cache-control": "no-store" } }), nonce, isAdminApi, requestId);
    }
  }

  if (botConfig.enabled && !activeGameplayRoute && decision.score >= botPolicyForLevel(botConfig.level).observeScore) {
    await logSecurityEvent({ ipAddress, countryCode, userAgent, endpoint: pathname, reason: decision.reasons.join("; "), action: "bot_observed", score: decision.score });
  }

  const paymentCallback = pathname.includes("/webhooks/") || pathname.includes("/payment-callback");
  // This is deliberately scoped to active gameplay routes rather than the
  // whole /api/games namespace. Mixed-purpose Admin settings stay protected.
  const shouldEvaluateChallenge = botConfig.enabled && !paymentCallback && !activeGameplayRoute && isTurnstileCandidateRoute(pathname) && decision.action !== "allow";
  if (shouldEvaluateChallenge) {
    const challengeToken = request.headers.get("x-turnstile-token") || undefined;
    const botDecision = await getBotProtectionProvider(botConfig.level).evaluate({
      action: pathname,
      abuseScore: decision.score,
      failedAttempts: failedAuthCount,
      challengeToken,
      remoteIp: ipAddress
    });
    if (botDecision.required) {
      await logSecurityEvent({ ipAddress, countryCode, userAgent, endpoint: pathname, reason: botDecision.reason, action: "bot_challenge_required", score: decision.score });
      return secureResponse(NextResponse.json({ code: "SECURITY_VERIFICATION_REQUIRED", message: "Please complete verification to continue." }, { status: 403, headers: { "cache-control": "no-store", "x-xmf-bot-provider": botDecision.provider } }), nonce, isAdminPage || isAdminApi, requestId);
    }
    if (challengeToken && botDecision.verified) {
      await logSecurityEvent({ ipAddress, countryCode, userAgent, endpoint: pathname, reason: botDecision.reason, action: "bot_challenge_passed", score: decision.score });
    }
  }

  if (decision.action === "block") {
    await logSecurityEvent({
      ipAddress,
      countryCode,
      userAgent,
      endpoint: request.nextUrl.pathname,
      reason: decision.reasons.join("; "),
        action: gameRoute ? "game_session_terminated" : "blocked",
      score: decision.score
    });
    return secureResponse(new NextResponse(gameRoute && pathname.startsWith("/api/") ? JSON.stringify({ code: "GAME_SECURITY_REJECTED", message: "This game request was rejected by security validation." }) : "Request blocked by security policy.", {
      status: 403,
      headers: {
        ...(gameRoute && pathname.startsWith("/api/") ? { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } : {}),
        "x-xmf-security": "blocked",
        "x-xmf-abuse-score": String(decision.score),
        "retry-after": String(decision.retryAfterSeconds || 900)
      }
    }), nonce, isAdminPage || isAdminApi, requestId);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set("xmf_req_count", String(requestCount), {
    path: "/",
    maxAge: 60,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production"
  });
  response.headers.set("x-xmf-security", decision.action);
  response.headers.set("x-xmf-abuse-score", String(decision.score));

  if (decision.action === "throttle") {
    await logSecurityEvent({
      ipAddress,
      countryCode,
      userAgent,
      endpoint: request.nextUrl.pathname,
      reason: decision.reasons.join("; "),
      action: "throttled",
      score: decision.score
    });
    response.headers.set("retry-after", String(decision.retryAfterSeconds || 60));
  }

  return secureResponse(response, nonce, isAdminPage || isAdminApi, requestId);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|assets).*)"]
};
