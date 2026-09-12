import { getHostedCheckoutProvider } from "@/lib/payments/provider";
import type { HostedCheckoutProvider } from "@/lib/payments/types";

/**
 * CCBill is intentionally an inactive adapter until merchant documentation,
 * callback signing rules, and server credentials are approved and configured.
 */
export const CCBILL_CONFIG_ENV = [
  "CCBILL_ACCOUNT_NUMBER",
  "CCBILL_SUBACCOUNT_NUMBER",
  "CCBILL_FLEXFORM_ID",
  "CCBILL_API_BASE_URL",
  "CCBILL_WEBHOOK_SECRET",
  "CCBILL_RETURN_URL"
] as const;

export function CCBillProcessor(): HostedCheckoutProvider {
  return getHostedCheckoutProvider("ccbill");
}

export const createCcbillProcessor = CCBillProcessor;
