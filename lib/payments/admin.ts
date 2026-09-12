import { configuredPaymentProcessorName, getHostedCheckoutProvider, hostedPaymentsCustomerState } from "@/lib/payments/provider";
import { reliabilityRows } from "@/lib/reliability/server";

export type HostedPaymentsAdminData = {
  configured: boolean;
  provider: string;
  processor: "NONE" | "SEGPAY" | "CCBILL";
  mode: "TEST" | "LIVE";
  providerStatus: "NOT_CONFIGURED" | "READY" | "ERROR";
  providerHealthDetail: string;
  lastVerifiedAt: string | null;
  callbackUrls: { segpay: string; ccbill: string; success: string; failure: string };
  integrationChecklist: Record<"segpay" | "ccbill", Array<{ label: string; verified: boolean }>>;
  displayMode: string;
  payments: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  findings: Array<Record<string, unknown>>;
};

export async function getHostedPaymentsAdminData(): Promise<HostedPaymentsAdminData> {
  const state = hostedPaymentsCustomerState();
  const provider = getHostedCheckoutProvider();
  const health = await provider.health();
  const baseUrl = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "UNVERIFIED";
  const configured = state.enabled;
  const [payments, events, findings] = await Promise.all([
    reliabilityRows("hosted_payments?select=id,user_id,provider,purpose,status,package_id,expected_amount_minor,expected_currency,expected_total_coins,provider_checkout_reference,provider_transaction_id,environment,reconciliation_status,failure_reason,created_at,redirected_at,confirmed_at&order=created_at.desc&limit=500"),
    reliabilityRows("hosted_payment_events?select=id,hosted_payment_id,provider,provider_event_id,provider_transaction_id,mapped_status,signature_verified,amount_minor,currency,environment,processing_result,created_at&order=created_at.desc&limit=500"),
    reliabilityRows("hosted_payment_reconciliation?select=id,hosted_payment_id,finding_key,finding_type,severity,status,summary,created_at,updated_at&order=created_at.desc&limit=500")
  ]);
  return {
    configured,
    provider: state.provider,
    processor: configuredPaymentProcessorName(),
    mode: provider.environment === "production" ? "LIVE" : "TEST",
    providerStatus: provider.configured ? (health.functional === false ? "ERROR" : "READY") : "NOT_CONFIGURED",
    providerHealthDetail: health.detail,
    lastVerifiedAt: configured ? new Date().toISOString() : null,
    callbackUrls: {
      segpay: `${baseUrl}/api/payments/segpay/postback`,
      ccbill: `${baseUrl}/api/payments/ccbill/webhook`,
      success: `${baseUrl}/payment/success`,
      failure: `${baseUrl}/payment/failed`
    },
    integrationChecklist: {
      segpay: [
        { label: "Merchant account approved", verified: false },
        { label: "Hosted payment configuration received", verified: false },
        { label: "Test credentials configured", verified: false },
        { label: "Postback and return URLs configured", verified: false },
        { label: "Test transaction passed", verified: false },
        { label: "Live activation approved", verified: false }
      ],
      ccbill: [
        { label: "Merchant account approved", verified: false },
        { label: "Account/subaccount configured", verified: false },
        { label: "FlexForm/API configuration received", verified: false },
        { label: "Webhook and return URLs configured", verified: false },
        { label: "Test transaction passed", verified: false },
        { label: "Live activation approved", verified: false }
      ]
    },
    displayMode: state.displayMode,
    payments,
    events,
    findings
  };
}
