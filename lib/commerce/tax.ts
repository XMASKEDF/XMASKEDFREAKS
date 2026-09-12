import "server-only";
import type { ShippingAddress } from "@/lib/purchase/types";

export async function quoteApplicableTax(input: { address: ShippingAddress; merchandiseCents: number; shippingCents: number; taxCodes: string[]; reference: string }) {
  const endpoint = process.env.TAX_API_URL?.trim();
  const apiKey = process.env.TAX_API_KEY?.trim();
  if (!endpoint || !apiKey) return { ok: false as const, code: "TAX_NOT_CONFIGURED", amountCents: null, provider: null };
  const response = await fetch(endpoint, {
    method: "POST",
    cache: "no-store",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ currency: "USD", amount_minor: input.merchandiseCents, shipping_minor: input.shippingCents, destination: input.address, product_tax_codes: input.taxCodes, reference: input.reference })
  }).catch(() => null);
  if (!response) return { ok: false as const, code: "TAX_PROVIDER_UNREACHABLE", amountCents: null, provider: null };
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  const amountCents = Number(payload?.tax_amount_minor);
  if (!response.ok || !Number.isSafeInteger(amountCents) || amountCents < 0) return { ok: false as const, code: "TAX_QUOTE_REJECTED", amountCents: null, provider: null };
  return { ok: true as const, code: null, amountCents, provider: String(payload?.provider || "configured_tax_provider") };
}
