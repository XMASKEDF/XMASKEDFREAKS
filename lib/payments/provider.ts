import { createHmac, timingSafeEqual } from "crypto";
import type {
  HostedCheckoutProvider,
  HostedCheckoutRequest,
  HostedCheckoutSession,
  HostedPaymentProviderName,
  HostedPaymentStatus,
  NormalizedPaymentEvent,
  NormalizedPaymentEventType,
  VerifiedProviderEvent
} from "./types.ts";

export const PAYMENT_PROVIDER_CAPABILITIES = [
  "HOSTED_CHECKOUT",
  "WEBHOOK_VERIFICATION",
  "REFUND",
  "RECONCILIATION",
  "SETTLEMENT_STATUS"
] as const;
export type PaymentProviderCapability = typeof PAYMENT_PROVIDER_CAPABILITIES[number];
export type PaymentProviderReadinessStatus = "NOT CONFIGURED" | "TEST REQUIRED" | "READY" | "DEGRADED";
export type PaymentProviderReadiness = {
  provider: HostedPaymentProviderName;
  status: PaymentProviderReadinessStatus;
  software: "READY" | "INCOMPLETE";
  configuration: "MISSING" | "PRESENT";
  providerStatus: "AWAITING APPROVAL" | "CONNECTED" | "NOT APPLICABLE";
  test: "REQUIRED" | "PASSED" | "NOT RUN";
  capabilities: PaymentProviderCapability[];
  detail: string;
};

const providerConfigurationKeys: Record<Exclude<HostedPaymentProviderName, "disabled">, readonly string[]> = {
  test: ["PAYMENT_TEST_SECRET"],
  ccbill: ["CCBILL_ACCOUNT_NUMBER", "CCBILL_SUBACCOUNT_NUMBER", "CCBILL_FLEXFORM_ID", "CCBILL_API_BASE_URL", "CCBILL_WEBHOOK_SECRET", "CCBILL_RETURN_URL"],
  segpay: ["SEGPAY_MERCHANT_ID", "SEGPAY_PRODUCT_CODE", "SEGPAY_HOSTED_CHECKOUT_URL", "SEGPAY_POSTBACK_SECRET", "SEGPAY_RETURN_URL"]
};

function configuredValue(name: string) {
  const value = String(process.env[name] || "").trim();
  return Boolean(value && !value.startsWith("replace-") && !value.includes("your-"));
}

function providerConfigurationPresent(name: Exclude<HostedPaymentProviderName, "disabled">) {
  const keys = providerConfigurationKeys[name];
  return { present: keys.filter(configuredValue).length, total: keys.length };
}

export function paymentProviderCapabilities(name: HostedPaymentProviderName): PaymentProviderCapability[] {
  // The test adapter is the only currently executable payment implementation.
  // CCBill and Segpay remain capability-empty until their approved contracts are supplied.
  return name === "test" ? ["HOSTED_CHECKOUT", "WEBHOOK_VERIFICATION"] : [];
}

export async function getPaymentProviderReadiness(name: Exclude<HostedPaymentProviderName, "disabled">): Promise<PaymentProviderReadiness> {
  const configuration = providerConfigurationPresent(name);
  const provider = getHostedCheckoutProvider(name);
  const capabilities = paymentProviderCapabilities(name);
  const base = {
    provider: name,
    software: "READY" as const,
    capabilities,
    test: name === "test" ? "NOT RUN" as const : "REQUIRED" as const
  };

  if (configuration.present === 0) {
    return { ...base, status: "NOT CONFIGURED", configuration: "MISSING", providerStatus: name === "test" ? "NOT APPLICABLE" : "AWAITING APPROVAL", detail: `${name.toUpperCase()} adapter is present but server configuration is absent. No payment request or callback is accepted.` };
  }
  if (configuration.present < configuration.total) {
    return { ...base, status: "NOT CONFIGURED", configuration: "MISSING", providerStatus: name === "test" ? "NOT APPLICABLE" : "AWAITING APPROVAL", detail: `${name.toUpperCase()} configuration is incomplete. No payment request or callback is accepted.` };
  }
  if (!provider.configured) {
    return { ...base, status: "TEST REQUIRED", configuration: "PRESENT", providerStatus: name === "test" ? "NOT APPLICABLE" : "AWAITING APPROVAL", detail: `${name.toUpperCase()} configuration values are present, but the adapter is intentionally fail-closed until its approved contract and verification test are complete.` };
  }
  const health = await provider.health();
  if (health.functional === true) {
    return { ...base, status: "READY", configuration: "PRESENT", providerStatus: "CONNECTED", test: "PASSED", detail: health.detail };
  }
  return { ...base, status: "DEGRADED", configuration: "PRESENT", providerStatus: "CONNECTED", detail: health.detail };
}

const allowedStatuses = new Set<HostedPaymentStatus>([
  "PROCESSING", "CONFIRMED", "DECLINED", "CANCELLED", "EXPIRED", "FAILED", "REQUIRES_REVIEW"
]);

function unavailable(name: HostedPaymentProviderName, detail: string): HostedCheckoutProvider {
  return {
    name,
    configured: false,
    environment: process.env.NODE_ENV === "production" ? "production" : "test",
    async createCheckoutSession() {
      return { ok: false, checkoutUrl: null, checkoutReference: null, errorCode: "PROVIDER_NOT_CONFIGURED" };
    },
    async buildHostedCheckoutUrl() {
      return { ok: false, checkoutUrl: null, checkoutReference: null, errorCode: "PROVIDER_NOT_CONFIGURED" };
    },
    async verifyCallback() {
      return invalidEvent(name === "disabled" ? "test" : name, "PROVIDER_DOCUMENTATION_REQUIRED");
    },
    async verifyWebhook() {
      return invalidEvent(name === "disabled" ? "test" : name, "PROVIDER_DOCUMENTATION_REQUIRED");
    },
    normalizePaymentEvent: (event) => normalizePaymentEvent(event),
    normalizeRefundEvent: () => null,
    normalizeChargebackEvent: () => null,
    normalizeSubscriptionEvent: () => null,
    getProviderReference: (event) => event.transactionId || event.eventId,
    async getTransactionStatus() {
      return null;
    },
    async health() {
      return { reachable: null, functional: null, detail };
    }
  };
}

function normalizeVerifiedEvent(event: VerifiedProviderEvent, type: NormalizedPaymentEventType): NormalizedPaymentEvent | null {
  if (!event.verified || !event.eventId) return null;
  return {
    type,
    provider: event.provider,
    eventId: event.eventId,
    transactionId: event.transactionId,
    internalPaymentId: event.internalPaymentId,
    amountMinor: event.amountMinor,
    currency: event.currency,
    environment: event.environment,
    rawStatus: event.status
  };
}

function normalizePaymentEvent(event: VerifiedProviderEvent): NormalizedPaymentEvent | null {
  if (event.status === "DECLINED" || event.status === "FAILED") return normalizeVerifiedEvent(event, "PAYMENT_DECLINED");
  if (event.status === "CONFIRMED") return normalizeVerifiedEvent(event, "PAYMENT_APPROVED");
  return normalizeVerifiedEvent(event, "PAYMENT_STARTED");
}

function invalidEvent(provider: "test" | "segpay" | "ccbill", errorCode: string): VerifiedProviderEvent {
  return { verified: false, provider, eventId: null, transactionId: null, internalPaymentId: null, status: null, amountMinor: null, currency: null, environment: null, errorCode };
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function testProvider(): HostedCheckoutProvider {
  const secret = process.env.PAYMENT_TEST_SECRET?.trim() || "";
  const configured = process.env.NODE_ENV !== "production" && secret.length >= 24;
  return {
    name: "test",
    configured,
    environment: "test",
    async createCheckoutSession(request: HostedCheckoutRequest): Promise<HostedCheckoutSession> {
      if (!configured || request.environment !== "test") {
        return { ok: false, checkoutUrl: null, checkoutReference: null, errorCode: "TEST_PROVIDER_DISABLED" };
      }
      return {
        ok: true,
        checkoutUrl: request.successUrl,
        checkoutReference: `test_checkout_${request.internalPaymentId}`,
        errorCode: null
      };
    },
    async buildHostedCheckoutUrl(request: HostedCheckoutRequest) {
      return this.createCheckoutSession(request);
    },
    async verifyCallback(request: Request, rawBody: string) {
      if (!configured) return invalidEvent("test", "TEST_PROVIDER_DISABLED");
      const supplied = request.headers.get("x-xmf-test-signature") || "";
      const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
      if (!supplied || !secureEqual(supplied, expected)) return invalidEvent("test", "INVALID_TEST_SIGNATURE");
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        return invalidEvent("test", "INVALID_TEST_PAYLOAD");
      }
      const status = String(body.status || "") as HostedPaymentStatus;
      if (!allowedStatuses.has(status)) return invalidEvent("test", "UNSUPPORTED_TEST_STATUS");
      const eventId = String(body.eventId || "");
      const transactionId = String(body.transactionId || "");
      const internalPaymentId = String(body.internalPaymentId || "");
      const amountMinor = Number(body.amountMinor);
      if (!eventId || !transactionId || !/^[0-9a-f-]{36}$/i.test(internalPaymentId) || !Number.isSafeInteger(amountMinor) || amountMinor < 1) {
        return invalidEvent("test", "INCOMPLETE_TEST_PAYLOAD");
      }
      return {
        verified: true,
        provider: "test",
        eventId,
        transactionId,
        internalPaymentId,
        status,
        amountMinor,
        currency: String(body.currency || "").toUpperCase(),
        environment: body.environment === "test" ? "test" : body.environment === "production" ? "production" : null,
        errorCode: null
      };
    },
    async verifyWebhook(request: Request, rawBody: string) {
      return this.verifyCallback(request, rawBody);
    },
    normalizePaymentEvent: (event) => normalizePaymentEvent(event),
    normalizeRefundEvent: (event) => normalizeVerifiedEvent(event, "PAYMENT_REFUNDED"),
    normalizeChargebackEvent: (event) => normalizeVerifiedEvent(event, "PAYMENT_CHARGEBACK"),
    normalizeSubscriptionEvent: () => null,
    getProviderReference: (event) => event.transactionId || event.eventId,
    async getTransactionStatus() {
      return null;
    },
    async health() {
      return configured
        ? { reachable: true, functional: true, detail: "Local test provider is configured for development only." }
        : { reachable: null, functional: null, detail: "Set a development-only PAYMENT_TEST_SECRET of at least 24 characters." };
    }
  };
}

export function configuredPaymentProviderName(): HostedPaymentProviderName {
  const value = process.env.PAYMENT_PROVIDER?.trim().toLowerCase();
  return value === "test" || value === "segpay" || value === "ccbill" ? value : "disabled";
}

export function configuredPaymentProcessorName(): "NONE" | "SEGPAY" | "CCBILL" {
  const provider = configuredPaymentProviderName();
  return provider === "segpay" ? "SEGPAY" : provider === "ccbill" ? "CCBILL" : "NONE";
}

export function getHostedCheckoutProvider(requested?: string): HostedCheckoutProvider {
  const configuredName = configuredPaymentProviderName();
  const selected = requested || configuredName;
  if (!["disabled", "test", "segpay", "ccbill"].includes(selected)) {
    return unavailable("disabled", "Unknown payment provider.");
  }
  if (selected !== configuredName) return unavailable(selected as HostedPaymentProviderName, "Callback provider does not match the active server configuration.");
  if (selected === "test") return testProvider();
  if (selected === "segpay") return unavailable("segpay", "Segpay remains disabled until official integration documentation and credentials are supplied.");
  if (selected === "ccbill") return unavailable("ccbill", "CCBill remains disabled until official integration documentation and credentials are supplied.");
  return unavailable("disabled", "Hosted card payments are not active. Select and configure an approved provider before enabling production checkout.");
}

export function hostedPaymentsCustomerState() {
  const provider = getHostedCheckoutProvider();
  const displayMode = process.env.PAYMENT_DISABLED_CUSTOMER_MODE || "setup_in_progress";
  return {
    provider: provider.name,
    processor: configuredPaymentProcessorName(),
    enabled: provider.configured,
    displayMode: ["hidden", "coming_soon", "setup_in_progress"].includes(displayMode) ? displayMode : "setup_in_progress",
    message: provider.configured
      ? "Your payment will be completed securely on our payment provider’s website. XMASKEDFREAKS does not receive or store your card details."
      : "Payment setup is in progress. Existing wallet coins can still be used for eligible purchases."
  };
}
