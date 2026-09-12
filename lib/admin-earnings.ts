import "server-only";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";

export type VerifiedEarningCategory = "tip" | "coin_sale" | "merchandise" | "painting" | "audio_clip" | "auction" | "subscription" | "other";

export async function recordVerifiedAdminEarning(input: { category: VerifiedEarningCategory; sourceType: string; sourceId: string; amountMinor: number; shippingMinor?: number; fulfillmentCostMinor?: number; processorFeeMinor?: number }) {
  if (process.env.XMF_SANDBOX_MODE === "true") return { stored: false, configured: true, sandbox: true };
  const service = serviceCredentials();
  if (!service || !input.sourceId || !Number.isSafeInteger(input.amountMinor) || input.amountMinor < 0) return { stored: false, configured: false };
  const response = await fetch(`${service.url}/rest/v1/rpc/record_verified_admin_earning`, { method: "POST", headers: serviceHeaders(service), body: JSON.stringify({ p_category: input.category, p_source_type: input.sourceType.slice(0, 80), p_source_id: input.sourceId.slice(0, 180), p_amount_minor: input.amountMinor, p_shipping_minor: input.shippingMinor || 0, p_fulfillment_cost_minor: input.fulfillmentCostMinor ?? null, p_processor_fee_minor: input.processorFeeMinor ?? null }) }).catch(() => null);
  return { stored: Boolean(response?.ok), configured: true };
}
