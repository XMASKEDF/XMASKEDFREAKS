import { getHostedCheckoutProvider } from "@/lib/payments/provider";
import type { HostedCheckoutProvider } from "@/lib/payments/types";

/**
 * Segpay is intentionally an inactive adapter until merchant documentation,
 * callback signing rules, and server credentials are approved and configured.
 */
export const SEGPAY_CONFIG_ENV = [
  "SEGPAY_MERCHANT_ID",
  "SEGPAY_PRODUCT_CODE",
  "SEGPAY_HOSTED_CHECKOUT_URL",
  "SEGPAY_POSTBACK_SECRET",
  "SEGPAY_RETURN_URL"
] as const;

export function SegpayProcessor(): HostedCheckoutProvider {
  return getHostedCheckoutProvider("segpay");
}

export const createSegpayProcessor = SegpayProcessor;
