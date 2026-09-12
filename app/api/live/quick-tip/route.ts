import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getApiUser, serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { createLiveGuestCookie, LIVE_GUEST_COOKIE, liveSubjectReference } from "@/lib/live/guest-identity";
import { getHostedCheckoutProvider } from "@/lib/payments/provider";
import { paymentRows, trustedPublicOrigin } from "@/lib/payments/server";
import { DEFAULT_TIP_OPTIONS, normalizeTipOptions, type TipOption } from "@/lib/tips";
import { recordReliabilityIncident } from "@/lib/reliability/server";

export const dynamic = "force-dynamic";

type QuickTipBody = {
  quickTipId?: string;
  stage?: "entry" | "hourly" | "voluntary";
  returnTo?: string;
  streamId?: string;
  displayName?: string;
  message?: string;
  locale?: string;
};

function safeDisplayName(value: unknown) {
  return String(value || "Masked guest").replace(/[^a-z0-9_ -]/gi, "").trim().slice(0, 32) || "Masked guest";
}

async function readLiveTipOptions() {
  const service = serviceCredentials();
  if (!service) return DEFAULT_TIP_OPTIONS;
  const response = await fetch(`${service.url}/rest/v1/tip_options?select=id,emoji,phrase,token_cost,enabled,display_order,featured,temporary_available,live_only,alert_style,sound_style,media_id,artwork_url&order=display_order.asc`, {
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

function safeIdempotencyKey(value: string | null) {
  const candidate = String(value || "").trim();
  return candidate.length >= 16 && candidate.length <= 160 && /^[A-Za-z0-9:_-]+$/.test(candidate) ? candidate : null;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as QuickTipBody;
  if (body.returnTo !== "/live") return NextResponse.json({ ok: false, message: "Quick tips are available only from the Live room." }, { status: 422 });
  const idempotencyKey = safeIdempotencyKey(request.headers.get("idempotency-key"));
  if (!idempotencyKey) return NextResponse.json({ ok: false, message: "A unique checkout key is required." }, { status: 400 });

  const amountId = String(body.quickTipId || "").slice(0, 80);
  const quickTips = await readLiveTipOptions();
  const selected: TipOption | undefined = quickTips.find((item) => item.id === amountId && item.enabled && item.temporaryAvailable && item.liveOnly);
  if (!selected) return NextResponse.json({ ok: false, message: "Choose an available quick tip amount." }, { status: 422 });

  const provider = getHostedCheckoutProvider();
  if (!provider.configured) return NextResponse.json({ ok: false, code: "PROVIDER_UNAVAILABLE", message: "Secure card checkout is not configured yet. Your Live reminder remains active." }, { status: 503 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ ok: false, code: "PAYMENT_STORAGE_UNAVAILABLE", message: "Secure checkout is temporarily unavailable. No charge was attempted." }, { status: 503 });

  const user = await getApiUser(request);
  const existingGuest = request.cookies.get(LIVE_GUEST_COOKIE)?.value || null;
  const guestCookie = user ? null : (existingGuest || createLiveGuestCookie());
  const subjectRef = liveSubjectReference(user?.id || null, guestCookie);
  if (!subjectRef) return NextResponse.json({ ok: false, message: "Live identity could not be established." }, { status: 503 });

  const existingResponse = await fetch(`${service.url}/rest/v1/hosted_payments?idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&purpose=eq.tip&subject_ref=eq.${encodeURIComponent(subjectRef)}&select=id,status,provider,expected_total_coins,expected_amount_minor&limit=1`, {
    cache: "no-store", headers: serviceHeaders(service)
  }).catch(() => null);
  const [existing] = existingResponse?.ok ? await existingResponse.json() as Array<Record<string, unknown>> : [];
  if (existing) {
    const response = NextResponse.json({
      ok: true,
      paymentId: existing.id,
      status: existing.status,
      checkoutUrl: existing.status === "CONFIRMED" ? `${trustedPublicOrigin(request)}/live?payment=confirmed` : null,
      message: existing.status === "CONFIRMED" ? "Tip already confirmed." : "This secure checkout is already being prepared."
    });
    if (guestCookie && !existingGuest) response.cookies.set(LIVE_GUEST_COOKIE, guestCookie, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return response;
  }

  const paymentId = randomUUID();
  const amountMinor = selected.tokenCost * 50;
  const environment = provider.environment;
  const stored = await paymentRows("hosted_payments", {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({
      id: paymentId,
      user_id: user?.id || null,
      guest_reference: user ? null : subjectRef,
      subject_ref: subjectRef,
      provider: provider.name,
      purpose: "tip",
      status: "PENDING_REDIRECT",
      package_id: selected.id,
      expected_amount_minor: amountMinor,
      expected_currency: "USD",
      expected_base_coins: selected.tokenCost,
      expected_bonus_coins: 0,
      expected_total_coins: selected.tokenCost,
      idempotency_key: idempotencyKey,
      environment,
      terms_accepted: true,
      coin_policy_acknowledged: true,
      coin_policy_version: "live-quick-tip-v1",
      live_display_name: safeDisplayName(body.displayName),
      live_message: String(body.message || "").trim().slice(0, 120) || null,
      live_anonymous: false,
      checkout_snapshot: {
        type: "direct_live_tip",
        quickTipId: selected.id,
        stage: body.stage === "entry" || body.stage === "hourly" ? body.stage : "voluntary",
        coins: selected.tokenCost,
        amountMinor,
        locale: String(body.locale || "en").slice(0, 20),
        streamId: String(body.streamId || "daily-live").slice(0, 120)
      }
    })
  }).then(() => true).catch(() => false);
  if (!stored) {
    await recordReliabilityIncident({
      title: "Live quick-tip payment record could not be created",
      plainExplanation: "Secure Live tipping stopped before redirect because its server record could not be preserved.",
      severity: 4,
      feature: "Live Quick Tips",
      affectedRoute: "/api/live/quick-tip",
      userId: user?.id,
      financialImpact: true,
      moneyAtRisk: false
    });
    return NextResponse.json({ ok: false, message: "Secure checkout is temporarily unavailable. No charge was attempted." }, { status: 503 });
  }

  const origin = trustedPublicOrigin(request);
  const returnHint = `?returnTo=%2Flive&quickTip=1`;
  const session = await provider.createCheckoutSession({
    internalPaymentId: paymentId,
    customerReference: user?.id || guestCookie || subjectRef,
    purpose: "tip",
    amountMinor,
    currency: "USD",
    packageId: selected.id,
    successUrl: `${origin}/payments/return/${paymentId}${returnHint}`,
    cancelUrl: `${origin}/payments/return/${paymentId}${returnHint}&cancelled=1`,
    environment
  });
  if (!session.ok || !session.checkoutUrl) {
    await paymentRows(`hosted_payments?id=eq.${paymentId}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ status: "FAILED", failed_at: new Date().toISOString(), failure_reason: session.errorCode, updated_at: new Date().toISOString() }) }).catch(() => undefined);
    return NextResponse.json({ ok: false, code: "CHECKOUT_START_FAILED", message: "Secure payment could not be started. No charge was attempted." }, { status: 503 });
  }
  const redirected = await paymentRows(`hosted_payments?id=eq.${paymentId}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ status: "REDIRECTED", provider_checkout_reference: session.checkoutReference, redirected_at: new Date().toISOString(), updated_at: new Date().toISOString() }) }).then(() => true).catch(() => false);
  if (!redirected) return NextResponse.json({ ok: false, message: "Checkout could not be recorded safely. No redirect was performed." }, { status: 503 });
  const response = NextResponse.json({ ok: true, paymentId, checkoutUrl: session.checkoutUrl, returnUrl: `${origin}/live`, coins: selected.tokenCost, amountMinor, message: "Continue on the secure hosted payment page." });
  if (guestCookie && !existingGuest) response.cookies.set(LIVE_GUEST_COOKIE, guestCookie, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return response;
}
