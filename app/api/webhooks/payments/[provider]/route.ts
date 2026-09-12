import { NextRequest } from "next/server";
import { handleHostedPaymentWebhook } from "@/lib/payments/webhook-handler";

// The shared handler performs verifyCallback, provider_event_id idempotency,
// and confirm_hosted_coin_payment only after a verified callback.
export async function POST(request: NextRequest, context: { params: { provider: string } }) {
  return handleHostedPaymentWebhook(request, context.params.provider);
}
