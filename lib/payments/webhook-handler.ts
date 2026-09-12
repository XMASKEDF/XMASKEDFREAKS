import { NextResponse } from "next/server";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { configuredPaymentProviderName, getHostedCheckoutProvider } from "@/lib/payments/provider";
import { paymentRows } from "@/lib/payments/server";
import { recordReliabilityIncident } from "@/lib/reliability/server";
import { recordVerifiedContribution } from "@/lib/contribution-server";
import { recordVerifiedAdminEarning } from "@/lib/admin-earnings";

const providerNames = new Set(["test", "segpay", "ccbill"]);

export async function handleHostedPaymentWebhook(request: Request, providerName: string) {
  if (!providerNames.has(providerName) || providerName !== configuredPaymentProviderName()) {
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 64_000) return NextResponse.json({ message: "Payload too large." }, { status: 413 });
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody) > 64_000) return NextResponse.json({ message: "Payload too large." }, { status: 413 });
  const provider = getHostedCheckoutProvider(providerName);
  if (!provider.configured) return NextResponse.json({ message: "Provider callback is not configured." }, { status: 503 });
  const event = await provider.verifyWebhook(request, rawBody);
  if (!event.verified || !event.eventId || !event.internalPaymentId || !event.status) {
    await recordReliabilityIncident({
      title: "Hosted payment callback rejected",
      plainExplanation: "A payment callback failed authenticity or payload validation and no wallet credit was attempted.",
      technicalExplanation: event.errorCode || "Callback verification failed.",
      severity: 4,
      feature: "Hosted Payments",
      affectedRoute: `/api/payments/${providerName}/callback`,
      financialImpact: true,
      securityImpact: true,
      moneyAtRisk: false
    });
    return NextResponse.json({ message: "Callback rejected." }, { status: 401 });
  }

  const paymentResponse = await paymentRows(
    `hosted_payments?id=eq.${event.internalPaymentId}&provider=eq.${providerName}&select=*&limit=1`
  ).catch(() => null);
  const [payment] = paymentResponse?.ok ? await paymentResponse.json() as Array<Record<string, unknown>> : [];
  if (!payment) return NextResponse.json({ message: "Payment not found." }, { status: 404 });

  const eventInsert = await paymentRows("hosted_payment_events", {
    method: "POST",
    headers: { prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({
      hosted_payment_id: event.internalPaymentId,
      provider: providerName,
      provider_event_id: event.eventId,
      provider_transaction_id: event.transactionId,
      mapped_status: event.status,
      signature_verified: true,
      amount_minor: event.amountMinor,
      currency: event.currency,
      environment: event.environment,
      sanitized_metadata: { callbackType: "hosted_payment_status" },
      processed_at: new Date().toISOString(),
      processing_result: event.status === "CONFIRMED" ? "confirmation_requested" : "status_recorded"
    })
  }).catch(() => null);
  if (!eventInsert?.ok) return NextResponse.json({ message: "Callback storage unavailable." }, { status: 503 });
  const inserted = await eventInsert.json() as Array<Record<string, unknown>>;
  if (inserted.length === 0) {
    // A duplicate callback is terminal only after the first attempt recorded a
    // completed result. Incomplete confirmations must be safely retriable.
    const existingResponse = await paymentRows(`hosted_payment_events?provider=eq.${providerName}&provider_event_id=eq.${encodeURIComponent(event.eventId || "")}&select=processing_result&limit=1`).catch(() => null);
    const [existing] = existingResponse?.ok ? await existingResponse.json() as Array<Record<string, unknown>> : [];
    if (existing && ["confirmed", "status_recorded"].includes(String(existing.processing_result))) return NextResponse.json({ ok: true, duplicate: true });
  }

  const markEvent = async (processingResult: string) => {
    await paymentRows(`hosted_payment_events?provider=eq.${providerName}&provider_event_id=eq.${encodeURIComponent(event.eventId || "")}`, {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({ processing_result: processingResult, processed_at: new Date().toISOString() })
    }).catch(() => undefined);
  };

  if (event.status === "CONFIRMED") {
    const service = serviceCredentials();
    if (!service || event.amountMinor === null || !event.currency || !event.environment || !event.transactionId) {
      await markEvent("reconciliation_required");
      return NextResponse.json({ message: "Confirmation is incomplete." }, { status: 422 });
    }
    const liveTip = String(payment.purpose) === "tip";
    const credit = await fetch(`${service.url}/rest/v1/rpc/${liveTip ? "confirm_hosted_live_tip_payment" : "confirm_hosted_coin_payment"}`, {
      method: "POST",
      headers: serviceHeaders(service),
      body: JSON.stringify({
        p_payment_id: event.internalPaymentId,
        p_provider: providerName,
        p_provider_transaction_id: event.transactionId,
        p_amount_minor: event.amountMinor,
        p_currency: event.currency,
        p_environment: event.environment
      })
    }).catch(() => null);
    const creditResult = credit?.ok ? await credit.json().catch(() => ({})) as Record<string, unknown> : {};
    if (!credit?.ok || creditResult.reviewRequired === true) {
      await markEvent("reconciliation_required");
      await recordReliabilityIncident({
        title: "Verified payment requires reconciliation",
        plainExplanation: liveTip
          ? "The processor confirmed a Live tip, but its contribution record did not complete automatically."
          : "The processor confirmed a payment, but the atomic wallet credit did not complete.",
        technicalExplanation: `${liveTip ? "Live tip" : "Wallet"} confirmation RPC returned ${credit?.status || "no response"}.`,
        severity: 5,
        feature: "Hosted Payments",
        affectedRoute: `/api/payments/${providerName}/callback`,
        paymentId: event.internalPaymentId,
        affectedWalletTransactionCount: liveTip ? 0 : 1,
        financialImpact: true,
        moneyAtRisk: true,
        recommendedAdminAction: "Review the Hosted Payments reconciliation panel. Do not credit manually without matching the provider transaction."
      });
      return NextResponse.json({ message: "Stored for reconciliation." }, { status: 503 });
    }
    if (!liveTip) {
      await recordVerifiedContribution({
        userId: String(payment.user_id),
        category: "coin_purchase",
        coins: Math.max(0, Math.floor(Number(payment.expected_total_coins || 0))),
        transactionReference: event.transactionId,
        source: `hosted_payment:${providerName}`
      });
      await recordVerifiedAdminEarning({ category: "coin_sale", sourceType: `hosted_payment:${providerName}`, sourceId: event.transactionId, amountMinor: event.amountMinor });
    } else if (creditResult.duplicate !== true) {
      await recordVerifiedAdminEarning({ category: "tip", sourceType: `hosted_payment:${providerName}`, sourceId: event.transactionId, amountMinor: event.amountMinor });
      if (payment.live_anonymous !== true) {
        const publicEventResponse = await paymentRows("public_live_tip_events", {
          method: "POST",
          headers: { prefer: "resolution=ignore-duplicates,return=minimal" },
          body: JSON.stringify({
            transaction_reference: event.transactionId,
            public_display_name: String(payment.live_display_name || "Masked guest").slice(0, 32),
            tip_coins: Math.max(1, Math.floor(Number(payment.expected_total_coins || 0))),
            approved_message: payment.live_message ? String(payment.live_message).slice(0, 120) : null,
            created_at: new Date().toISOString()
          })
        }).catch(() => null);
        if (!publicEventResponse?.ok) {
          await recordReliabilityIncident({
            title: "Live quick-tip public event failed",
            plainExplanation: "A confirmed Live tip was recorded, but its public activity notification could not be written.",
            severity: 3,
            feature: "Live Quick Tips",
            affectedRoute: `/api/payments/${providerName}/callback`,
            paymentId: event.internalPaymentId,
            financialImpact: false,
            moneyAtRisk: false
          });
        }
      }
    }
    await markEvent("confirmed");
    return NextResponse.json({ ok: true });
  }

  const terminal = new Set(["DECLINED", "CANCELLED", "EXPIRED", "FAILED"]);
  await paymentRows(`hosted_payments?id=eq.${event.internalPaymentId}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({
      status: event.status,
      provider_transaction_id: event.transactionId,
      last_callback_at: new Date().toISOString(),
      failed_at: terminal.has(event.status) ? new Date().toISOString() : null,
      failure_reason: terminal.has(event.status) ? event.status : null,
      updated_at: new Date().toISOString()
    })
  });
  return NextResponse.json({ ok: true });
}
