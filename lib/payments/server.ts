import { serviceCredentials, serviceHeaders } from "@/lib/api-user";

export const coinDisclosure =
  "Platform Coins can only be used for tipping during live streams and for eligible merchandise available on this website. Coins cannot be exchanged for cash and cannot be transferred outside the platform.";

export function validIdempotencyKey(value: string | null) {
  const candidate = value?.trim() || "";
  return candidate.length >= 16 && candidate.length <= 160 && /^[A-Za-z0-9:_-]+$/.test(candidate)
    ? candidate
    : crypto.randomUUID();
}

export function trustedPublicOrigin(request: Request) {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:")) return url.origin;
    } catch {
      // Fall through to development request origin.
    }
  }
  if (process.env.NODE_ENV !== "production") return new URL(request.url).origin;
  throw new Error("APP_URL_REQUIRED");
}

export async function paymentRows(path: string, init?: RequestInit) {
  const service = serviceCredentials();
  if (!service) throw new Error("PAYMENT_STORAGE_NOT_CONFIGURED");
  const response = await fetch(`${service.url}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: { ...serviceHeaders(service), ...(init?.headers || {}) }
  });
  if (!response.ok) throw new Error(`PAYMENT_STORAGE_${response.status}`);
  return response;
}
