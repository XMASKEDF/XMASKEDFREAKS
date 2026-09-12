import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/api-user";
import { quoteCoinPackage } from "@/lib/config";
import { getOperationalCoinPackage } from "@/lib/admin-operationalization";
import { getHostedCheckoutProvider } from "@/lib/payments/provider";
import { coinDisclosure, paymentRows, trustedPublicOrigin, validIdempotencyKey } from "@/lib/payments/server";
import { recordReliabilityIncident } from "@/lib/reliability/server";

type HostedPaymentBody = {
  packageId?: string;
  purpose?: string;
  termsAccepted?: boolean;
  coinPolicyAcknowledged?: boolean;
  returnTo?: string;
};

export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return NextResponse.json({ message: "Sign in before purchasing coins." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as HostedPaymentBody;
  if (body.purpose !== "coin_purchase") return NextResponse.json({ message: "This payment category is not approved." }, { status: 422 });
  if (!body.termsAccepted || !body.coinPolicyAcknowledged) {
    return NextResponse.json({ message: "Terms and Coin Usage acknowledgement are required.", disclosure: coinDisclosure }, { status: 428 });
  }
  const coinPackage = await getOperationalCoinPackage(String(body.packageId || ""));
  if (!coinPackage) return NextResponse.json({ message: "Choose an active coin package." }, { status: 422 });
  const quote = quoteCoinPackage(coinPackage);
  const provider = getHostedCheckoutProvider();
  if (!provider.configured) {
    return NextResponse.json({ message: "Payment setup is in progress. No card information can be entered on this website." }, { status: 503 });
  }

  const idempotencyKey = validIdempotencyKey(request.headers.get("idempotency-key"));
  const existingResponse = await paymentRows(
    `hosted_payments?user_id=eq.${user.id}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=*&limit=1`
  ).catch(() => null);
  const existing = existingResponse?.ok ? (await existingResponse.json() as Array<Record<string, unknown>>)[0] : null;
  if (existing && existing.status === "CONFIRMED") {
    return NextResponse.json({ paymentId: existing.id, status: existing.status, returnUrl: `/payments/return/${existing.id}` });
  }

  const origin = trustedPublicOrigin(request);
  const paymentId = existing ? String(existing.id) : crypto.randomUUID();
  const environment = provider.environment;
  if (!existing) {
    const stored = await paymentRows("hosted_payments", {
      method: "POST",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({
        id: paymentId,
        user_id: user.id,
        provider: provider.name,
        purpose: "coin_purchase",
        status: "PENDING_REDIRECT",
        package_id: quote.id,
        expected_amount_minor: quote.amountCents,
        expected_currency: "USD",
        expected_base_coins: quote.baseCoins,
        expected_bonus_coins: quote.bonusCoins,
        expected_total_coins: quote.totalCoins,
        idempotency_key: idempotencyKey,
        environment,
        terms_accepted: true,
        coin_policy_acknowledged: true,
        coin_policy_version: "v1",
        checkout_snapshot: {
          packageId: quote.id,
          label: quote.label,
          amountMinor: quote.amountCents,
          currency: "USD",
          baseCoins: quote.baseCoins,
          bonusCoins: quote.bonusCoins,
          totalCoins: quote.totalCoins
        }
      })
    }).then(() => true).catch(() => false);
    if (!stored) {
      await recordReliabilityIncident({
        title: "Hosted payment record could not be created",
        plainExplanation: "Secure checkout stopped before redirect because its server record could not be preserved.",
        severity: 4,
        feature: "Hosted Payments",
        affectedRoute: "/api/payments/hosted",
        userId: user.id,
        financialImpact: true,
        moneyAtRisk: false
      });
      return NextResponse.json({ message: "Secure checkout is temporarily unavailable. No charge was attempted." }, { status: 503 });
    }
  }

  const returnTo = body.returnTo === "/live" ? "/live" : null;
  const returnHint = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
  const successUrl = `${origin}/payments/return/${paymentId}${returnHint}`;
  const session = await provider.createCheckoutSession({
    internalPaymentId: paymentId,
    customerReference: user.id,
    purpose: "coin_purchase",
    amountMinor: quote.amountCents,
    currency: "USD",
    packageId: quote.id,
    successUrl,
    cancelUrl: `${origin}/payments/return/${paymentId}${returnHint}${returnHint ? "&" : "?"}cancelled=1`,
    environment
  });
  if (!session.ok || !session.checkoutUrl) {
    await paymentRows(`hosted_payments?id=eq.${paymentId}`, {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({ status: "FAILED", failed_at: new Date().toISOString(), failure_reason: session.errorCode, updated_at: new Date().toISOString() })
    }).catch(() => undefined);
    await recordReliabilityIncident({
      title: "Hosted checkout could not start",
      plainExplanation: "A customer could not be redirected to the approved payment provider.",
      technicalExplanation: session.errorCode || "Provider session creation failed.",
      severity: 3,
      feature: "Hosted Payments",
      affectedRoute: "/api/payments/hosted",
      userId: user.id,
      paymentId,
      financialImpact: true,
      moneyAtRisk: false
    });
    return NextResponse.json({ message: "Secure payment could not be started. No charge was attempted." }, { status: 503 });
  }
  const redirected = await paymentRows(`hosted_payments?id=eq.${paymentId}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({
      status: "REDIRECTED",
      provider_checkout_reference: session.checkoutReference,
      redirected_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  }).then(() => true).catch(() => false);
  if (!redirected) {
    return NextResponse.json({ message: "Checkout could not be recorded safely. No redirect was performed." }, { status: 503 });
  }
  return NextResponse.json({
    paymentId,
    checkoutUrl: session.checkoutUrl,
    returnUrl: successUrl,
    package: quote,
    message: "Continue on the secure hosted payment page."
  });
}
