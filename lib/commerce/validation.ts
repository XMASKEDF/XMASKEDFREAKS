import type { ShippingAddress } from "@/lib/purchase/types";

export function normalizeQuantity(value: unknown, maximum = 25) {
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= maximum ? quantity : null;
}

export function normalizeShippingAddress(value: unknown): ShippingAddress | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const clean = (key: string, maximum: number) => String(source[key] || "").trim().slice(0, maximum);
  const address = { fullName: clean("fullName", 120), addressLine1: clean("addressLine1", 180), addressLine2: clean("addressLine2", 180), city: clean("city", 120), region: clean("region", 120), postalCode: clean("postalCode", 40), country: clean("country", 100), phone: clean("phone", 40), instructions: clean("instructions", 500) };
  if (!address.fullName || !address.addressLine1 || !address.city || !address.postalCode || !address.country) return null;
  return address;
}

export function safeStoreDestination(value: string) {
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : null; } catch { return null; }
}
