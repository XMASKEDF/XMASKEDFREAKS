import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getApiUser, serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { DEFAULT_TIP_MENU_SETTINGS, DEFAULT_TIP_OPTIONS, normalizeTipMenuSettings, normalizeTipOptions, validateCustomTipTokens } from "@/lib/tips";
import { recordVerifiedContribution } from "@/lib/contribution-server";
import { publicTipEvent } from "@/lib/contribution-policy";
import { recordReliabilityIncident } from "@/lib/reliability/server";
import { recordVerifiedAdminEarning } from "@/lib/admin-earnings";
import { evaluateRisk, recordRiskEvent } from "@/lib/risk";
import { applyTipViewingCredit } from "@/lib/live/viewing-credit-server";

export const dynamic = "force-dynamic";

async function readOptions() {
  const service = serviceCredentials();
  if (!service) return DEFAULT_TIP_OPTIONS;
  const response = await fetch(`${service.url}/rest/v1/tip_options?select=*&order=display_order.asc`, {
    cache: "no-store",
    headers: serviceHeaders(service)
  }).catch(() => null);
  if (!response?.ok) return DEFAULT_TIP_OPTIONS;
  const rows = await response.json() as Array<Record<string, unknown>>;
  return normalizeTipOptions(rows.map((row) => ({
    id: row.id,
    emoji: row.emoji,
    phrase: row.phrase,
    tokenCost: row.token_cost,
    enabled: row.enabled,
    displayOrder: row.display_order,
    featured: row.featured,
    temporaryAvailable: row.temporary_available,
    liveOnly: row.live_only,
    alertStyle: row.alert_style,
    soundStyle: row.sound_style,
    mediaId: row.media_id,
    artworkUrl: row.artwork_url
  })));
}

async function readSettings() {
  const service = serviceCredentials();
  if (!service) return DEFAULT_TIP_MENU_SETTINGS;
  const response = await fetch(`${service.url}/rest/v1/tip_menu_settings?id=eq.1&select=*&limit=1`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null);
  if (!response?.ok) return DEFAULT_TIP_MENU_SETTINGS;
  const [row] = await response.json() as Array<Record<string, unknown>>;
  if (!row) return DEFAULT_TIP_MENU_SETTINGS;
  return normalizeTipMenuSettings(row);
}

export async function GET(request: NextRequest) {
  const [options, settings, user] = await Promise.all([readOptions(), readSettings(), getApiUser(request)]);
  const service = serviceCredentials();
  if (!user || !service) return NextResponse.json({ ok: true, authenticated: false, tokenBalance: null, options, settings, history: [] });
  const [walletResponse, historyResponse] = await Promise.all([
    fetch(`${service.url}/rest/v1/token_wallets?user_id=eq.${user.id}&select=balance_tokens&limit=1`, { cache: "no-store", headers: serviceHeaders(service) }),
    fetch(`${service.url}/rest/v1/live_tip_transactions?user_id=eq.${user.id}&status=eq.confirmed&select=id,tip_phrase,token_amount,balance_after,created_at&order=created_at.desc&limit=20`, { cache: "no-store", headers: serviceHeaders(service) })
  ]);
  const wallets = walletResponse.ok ? await walletResponse.json() as Array<{ balance_tokens: number }> : [];
  const history = historyResponse.ok ? await historyResponse.json() : [];
  return NextResponse.json({ ok: true, authenticated: true, tokenBalance: Number(wallets[0]?.balance_tokens || 0), options, settings, history });
}

export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return NextResponse.json({ ok: false, code: "AUTH_REQUIRED", message: "Sign in before sending a coin tip." }, { status: 401 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ ok: false, code: "WALLET_UNAVAILABLE", message: "The secure token wallet is not connected." }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const idempotencyKey = String(request.headers.get("idempotency-key") || body.idempotencyKey || "").trim().slice(0, 120);
  if (!idempotencyKey) return NextResponse.json({ ok: false, code: "IDEMPOTENCY_REQUIRED", message: "A unique tip confirmation key is required." }, { status: 400 });
  const settings = await readSettings();
  const custom = body.optionId === "custom" ? validateCustomTipTokens(body.customTokens, settings) : null;
  if (custom && !custom.ok) return NextResponse.json({ ok: false, code: "INVALID_CUSTOM_TIP", message: custom.error }, { status: 422 });

  const response = await fetch(`${service.url}/rest/v1/rpc/submit_live_tip`, {
    method: "POST",
    headers: serviceHeaders(service),
    body: JSON.stringify({
      p_user_id: user.id,
      p_tip_option_id: String(body.optionId || "").slice(0, 80),
      p_custom_tokens: custom?.ok ? custom.tokens : null,
      p_idempotency_key: idempotencyKey,
      p_session_id: String(body.sessionId || randomUUID()).slice(0, 120),
      p_stream_id: String(body.streamId || "daily-live").slice(0, 120),
      p_display_name: String(body.displayName || "Masked guest").replace(/[^a-z0-9_ -]/gi, "").trim().slice(0, 12) || "Masked guest"
    })
  }).catch(() => null);
  if (!response?.ok) {
    const errorText = await response?.text().catch(() => "") || "";
    const insufficient = errorText.includes("INSUFFICIENT_TOKENS");
    const disabled = errorText.includes("TIP_OPTION_UNAVAILABLE");
    return NextResponse.json({ ok: false, code: insufficient ? "INSUFFICIENT_TOKENS" : disabled ? "TIP_OPTION_UNAVAILABLE" : "TIP_FAILED", message: insufficient ? "You need more coins to send this tip." : disabled ? "This tip option is currently unavailable." : "The tip could not be confirmed. No coins were deducted." }, { status: insufficient ? 409 : 422 });
  }
  const result = await response.json() as Record<string, unknown>;
  const transactionReference = String(result.transactionId || result.transaction_id || idempotencyKey);
  const confirmedTokens = Math.max(1, Math.floor(Number(result.tokenAmount || result.token_amount || custom?.tokens || 0)));
  const liveViewingCredit = String(body.streamId || "daily-live") === "daily-live"
    ? await applyTipViewingCredit({
      userId: user.id,
      transactionReference,
      coins: confirmedTokens,
      playbackSessionId: String(body.playbackSessionId || body.sessionId || "").slice(0, 160) || null,
      sandbox: body.environment === "sandbox"
    })
    : { configured: false, snapshot: null };
  const riskDecision = evaluateRisk({ action: "tip", authenticated: true, amountMinor: confirmedTokens * 25, duplicateEvent: result.duplicate === true });
  await recordRiskEvent({ action: "tip", userId: user.id, transactionId: transactionReference, metadata: { duplicate: result.duplicate === true, tokenAmount: confirmedTokens }, decision: riskDecision });
  if (result.duplicate !== true) {
    await recordVerifiedContribution({
      userId: user.id,
      category: "tip",
      coins: confirmedTokens,
      transactionReference,
      source: "wallet_tip"
    });
    await recordVerifiedAdminEarning({ category: "tip", sourceType: "live_tip_transaction", sourceId: transactionReference, amountMinor: confirmedTokens * 25 });
    const publicSettingsResponse = await fetch(`${service.url}/rest/v1/contribution_rule_settings?id=eq.1&select=anonymous_tip_events_enabled,public_tip_messages_enabled&limit=1`, {
      cache: "no-store", headers: serviceHeaders(service)
    }).catch(() => null);
    const [publicSettings] = publicSettingsResponse?.ok ? await publicSettingsResponse.json() as Array<{ anonymous_tip_events_enabled?: boolean; public_tip_messages_enabled?: boolean }> : [];
    const anonymousRequested = body.anonymous === true;
    const tipEvent = publicTipEvent({
      displayName: body.displayName,
      nickname: body.nickname,
      anonymous: anonymousRequested,
      coins: confirmedTokens,
      message: body.message,
      transactionId: transactionReference
    });
    if (!anonymousRequested || publicSettings?.anonymous_tip_events_enabled !== false) {
      const publicEventResponse = await fetch(`${service.url}/rest/v1/public_live_tip_events`, {
        method: "POST",
        headers: serviceHeaders(service, "resolution=ignore-duplicates,return=minimal"),
        body: JSON.stringify({
          transaction_reference: tipEvent.id,
          public_display_name: tipEvent.displayName,
          tip_coins: tipEvent.coins,
          approved_message: publicSettings?.public_tip_messages_enabled === false ? null : tipEvent.message,
          created_at: tipEvent.createdAt
        })
      }).catch(() => null);
      if (!publicEventResponse?.ok) {
        await recordReliabilityIncident({
          title: "Privacy-safe public tip event failed",
          plainExplanation: "A confirmed tip succeeded, but its public Live notification could not be published.",
          technicalExplanation: "The sanitized public_live_tip_events insert failed.",
          severity: 2,
          feature: "Live tip notifications",
          affectedRoute: "/live",
          affectedCustomerCount: 1,
          paymentId: transactionReference,
          automaticResponse: "The private wallet transaction remains confirmed; no balance or account data was exposed.",
          recommendedAdminAction: "Inspect the public tip event table and realtime delivery health."
        });
      }
    }
  }
  return NextResponse.json({ ok: true, ...result, viewingCredit: liveViewingCredit.snapshot });
}
