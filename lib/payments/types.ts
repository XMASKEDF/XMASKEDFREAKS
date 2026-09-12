export type HostedPaymentProviderName = "disabled" | "test" | "segpay" | "ccbill";
export type PaymentProcessorName = "NONE" | "SEGPAY" | "CCBILL";
export type HostedPaymentPurpose = "coin_purchase" | "physical_purchase" | "digital_purchase" | "tip" | "paid_access";
export type HostedPaymentStatus =
  | "CREATED"
  | "PENDING_REDIRECT"
  | "REDIRECTED"
  | "PROCESSING"
  | "CONFIRMED"
  | "DECLINED"
  | "CANCELLED"
  | "EXPIRED"
  | "FAILED"
  | "REQUIRES_REVIEW"
  | "RECONCILIATION_MISMATCH";

export type NormalizedPaymentEventType =
  | "PAYMENT_STARTED"
  | "PAYMENT_APPROVED"
  | "PAYMENT_DECLINED"
  | "PAYMENT_SETTLED"
  | "PAYMENT_REFUNDED"
  | "PAYMENT_CHARGEBACK"
  | "SUBSCRIPTION_STARTED"
  | "SUBSCRIPTION_RENEWED"
  | "SUBSCRIPTION_CANCELED";

export type HostedCheckoutRequest = {
  internalPaymentId: string;
  customerReference: string;
  purpose: HostedPaymentPurpose;
  amountMinor: number;
  currency: "USD";
  packageId: string | null;
  successUrl: string;
  cancelUrl: string;
  environment: "test" | "production";
};

export type HostedCheckoutSession = {
  ok: boolean;
  checkoutUrl: string | null;
  checkoutReference: string | null;
  errorCode: string | null;
};

export type VerifiedProviderEvent = {
  verified: boolean;
  provider: Exclude<HostedPaymentProviderName, "disabled">;
  eventId: string | null;
  transactionId: string | null;
  internalPaymentId: string | null;
  status: HostedPaymentStatus | null;
  amountMinor: number | null;
  currency: string | null;
  environment: "test" | "production" | null;
  errorCode: string | null;
};

export type NormalizedPaymentEvent = {
  type: NormalizedPaymentEventType;
  provider: Exclude<HostedPaymentProviderName, "disabled">;
  eventId: string;
  transactionId: string | null;
  internalPaymentId: string | null;
  amountMinor: number | null;
  currency: string | null;
  environment: "test" | "production" | null;
  rawStatus: HostedPaymentStatus | null;
};

export interface HostedCheckoutProvider {
  readonly name: HostedPaymentProviderName;
  readonly configured: boolean;
  readonly environment: "test" | "production";
  createCheckoutSession(request: HostedCheckoutRequest): Promise<HostedCheckoutSession>;
  buildHostedCheckoutUrl(request: HostedCheckoutRequest): Promise<HostedCheckoutSession>;
  verifyCallback(request: Request, rawBody: string): Promise<VerifiedProviderEvent>;
  verifyWebhook(request: Request, rawBody: string): Promise<VerifiedProviderEvent>;
  normalizePaymentEvent(event: VerifiedProviderEvent): NormalizedPaymentEvent | null;
  normalizeRefundEvent(event: VerifiedProviderEvent): NormalizedPaymentEvent | null;
  normalizeChargebackEvent(event: VerifiedProviderEvent): NormalizedPaymentEvent | null;
  normalizeSubscriptionEvent(event: VerifiedProviderEvent): NormalizedPaymentEvent | null;
  getProviderReference(event: VerifiedProviderEvent): string | null;
  getTransactionStatus(transactionId: string): Promise<HostedPaymentStatus | null>;
  health(): Promise<{ reachable: boolean | null; functional: boolean | null; detail: string }>;
}

/** Provider-neutral name used by checkout and future fulfillment integrations. */
export type PaymentProcessor = HostedCheckoutProvider;
