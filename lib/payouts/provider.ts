import "server-only";

export type PayoutProvider = "provider_controlled" | "segpay" | "ccbill";
export type PayoutMode = "sandbox" | "production";

export type PayoutSubmission = {
  provider: PayoutProvider;
  mode: PayoutMode;
  amountMinor: number;
  currency: string;
  destinationToken?: string | null;
  idempotencyKey: string;
};

export type PayoutSubmissionResult = {
  status: "action_required" | "submitted";
  providerReference?: string;
  message: string;
};

/**
 * The provider-controlled adapter is intentionally conservative. A provider
 * must explicitly expose a merchant payout API before this adapter is replaced;
 * this layer never pretends that an internal sweep is a bank deposit.
 */
export async function submitPayout(input: PayoutSubmission): Promise<PayoutSubmissionResult> {
  if (input.provider === "provider_controlled") {
    return {
      status: "action_required",
      message: "Provider settlement approval is required before funds can be sent."
    };
  }
  return {
    status: "action_required",
    message: `${input.provider} payout API is not configured. Provider approval is required.`
  };
}
