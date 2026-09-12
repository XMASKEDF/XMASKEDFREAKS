import type { InfrastructureEnvironment } from "./types";

function environmentName(value = process.env.XMF_ENVIRONMENT || process.env.APP_ENV || "LOCAL"): InfrastructureEnvironment {
  const normalized = String(value).toUpperCase();
  return ["LOCAL", "SANDBOX", "STAGING", "PRODUCTION"].includes(normalized)
    ? normalized as InfrastructureEnvironment
    : "LOCAL";
}

function segment(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9:_-]/g, "-").slice(0, 180) || "unknown";
}

export function sharedStateNamespace() {
  return `xmf:${environmentName().toLowerCase()}`;
}

export function namespacedStateKey(domain: string, key: string) {
  return `${sharedStateNamespace()}:${segment(domain)}:${segment(key)}`;
}

// Hash request subjects before they become persistent cache keys. This keeps
// IPs, session references, and challenge material out of provider key listings.
export async function privateStateKey(domain: string, value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return namespacedStateKey(domain, hash);
}

export function sharedStateEnvironment() {
  return environmentName();
}
