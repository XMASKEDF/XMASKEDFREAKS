import { NextRequest } from "next/server";
import { handleHostedPaymentWebhook } from "@/lib/payments/webhook-handler";

export async function POST(request: NextRequest) {
  return handleHostedPaymentWebhook(request, "ccbill");
}
