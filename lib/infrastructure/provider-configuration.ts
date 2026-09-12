import { emailConfiguration } from "../email/provider";

export type Batch1ProviderId = "cloudflare" | "cloudflare-stream" | "printify" | "email";
export type Batch1ProviderState = "CONFIGURED" | "PARTIAL" | "NOT CONFIGURED" | "ERROR";

export type Batch1ProviderStatus = {
  id: Batch1ProviderId;
  label: string;
  state: Batch1ProviderState;
  lastSuccessfulHealthCheck: string | null;
  detail: string;
  mode?: "disabled" | "test" | "production";
  senderConfigured?: boolean;
  senderVerified?: boolean | null;
};

function value(name: string) {
  return String(process.env[name] || "").trim();
}

function urlValue(name: string) {
  const raw = value(name);
  if (!raw) return { present: false, valid: false };
  try {
    new URL(raw);
    return { present: true, valid: true };
  } catch {
    return { present: true, valid: false };
  }
}

function status(id: Batch1ProviderId, label: string, state: Batch1ProviderState, detail: string): Batch1ProviderStatus {
  return { id, label, state, lastSuccessfulHealthCheck: null, detail };
}

export function getBatch1ProviderStatuses(): Batch1ProviderStatus[] {
  const cloudflareToken = value("CLOUDFLARE_API_TOKEN");
  const cdnProvider = value("CDN_PROVIDER").toUpperCase();
  const cdnBase = urlValue("CDN_PUBLIC_BASE_URL");
  const cdnPurgeUrl = urlValue("CDN_PURGE_URL");
  const cdnPurgeToken = value("CDN_PURGE_TOKEN");
  const cloudflareConfigured = Boolean(cloudflareToken && cdnProvider === "CLOUDFLARE" && cdnBase.valid);
  const cloudflarePartial = Boolean(cloudflareToken || cdnProvider || cdnBase.present || cdnPurgeUrl.present || cdnPurgeToken);

  const streamHealth = urlValue("STREAM_HEALTH_URL");
  const streamPlayback = urlValue("STREAM_PLAYBACK_BASE_URL");
  const streamConfigured = streamHealth.valid && streamPlayback.valid;
  const streamPartial = streamHealth.present || streamPlayback.present;

  const printifyMode = value("PRINTIFY_INTEGRATION_MODE").toLowerCase();
  const printifyCredentials = ["PRINTIFY_API_TOKEN", "PRINTIFY_SHOP_ID", "PRINTIFY_WEBHOOK_SECRET", "CRON_SECRET"].map(value);
  const printifyConfigured = printifyCredentials.every(Boolean) && ["test", "live"].includes(printifyMode);
  const printifyPartial = printifyCredentials.some(Boolean) || Boolean(printifyMode);

  const email = emailConfiguration();
  const emailConfigured = email.configured;
  const emailPartial = email.provider !== "disabled" || email.senderConfigured || email.apiConfigured;

  return [
    status("cloudflare", "Cloudflare", cloudflareConfigured ? "CONFIGURED" : cloudflarePartial ? "PARTIAL" : "NOT CONFIGURED", cloudflareConfigured ? (cdnPurgeUrl.valid && cdnPurgeToken ? "Edge credentials and CDN delivery are configured; provider health still requires a live read-only check." : "Edge credentials and CDN delivery are configured; targeted purge credentials are incomplete.") : "Cloudflare edge, CDN, and WAF credentials are not fully configured."),
    status("cloudflare-stream", "Cloudflare Stream", streamConfigured ? "CONFIGURED" : streamPartial ? "PARTIAL" : "NOT CONFIGURED", streamConfigured ? "Streaming health and playback endpoints are configured; Cloudflare Stream account selection must still be confirmed." : "Cloudflare Stream requires the existing streaming health and playback endpoint configuration."),
    status("printify", "Printify", printifyConfigured ? "CONFIGURED" : printifyPartial ? "PARTIAL" : "NOT CONFIGURED", printifyConfigured ? `Printify ${printifyMode} credentials and scheduled-job secret are present; a provider health check is still required.` : "Printify credentials, shop mapping, webhook protection, and integration mode are not fully configured. Production fulfillment remains disabled."),
    { ...status("email", "Email Delivery", emailConfigured ? "CONFIGURED" : emailPartial ? "PARTIAL" : "NOT CONFIGURED", email.mode === "disabled" ? "Email delivery is disabled by default. Configure Resend, an explicit mode, a server-only key, and a verified sender before delivery." : emailConfigured ? "Resend API credentials are configured; sender/domain verification and a safe delivery test are still required." : "Email configuration is incomplete. Delivery is fail-closed until the provider, mode, key, sender, and test-recipient policy are valid."), mode: email.mode, senderConfigured: email.senderConfigured, senderVerified: emailConfigured ? null : false }
  ];
}
