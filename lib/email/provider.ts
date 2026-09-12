type EmailMode = "disabled" | "test" | "production";
type EmailProviderName = "disabled" | "resend" | "custom-http";
export type EmailDeliveryStatus = "SUCCESS" | "NOT CONFIGURED" | "TEMPORARY FAILURE" | "PROVIDER REJECTED" | "INVALID RECIPIENT" | "RATE LIMITED";
export type EmailDeliveryState = "QUEUED" | "PROVIDER_ACCEPTED" | "DELIVERED" | "FAILED";
export type EmailHealthStatus = "NOT CONFIGURED" | "HEALTHY" | "DEGRADED" | "OFFLINE" | "ACTION REQUIRED";

export type EmailMessage = {
  to: string | string[];
  from?: string;
  subject: string;
  html?: string;
  text: string;
  replyTo?: string;
  idempotencyKey: string;
  category?: string;
  metadata?: Record<string, string>;
};

export type EmailDeliveryResult = {
  delivered: boolean;
  accepted: boolean;
  state: EmailDeliveryState;
  status: EmailDeliveryStatus;
  providerReference?: string;
  temporaryFailure?: boolean;
  error?: string;
};

export type EmailProviderHealth = {
  provider: EmailProviderName;
  mode: EmailMode;
  status: EmailHealthStatus;
  configured: boolean;
  senderConfigured: boolean;
  senderVerified: boolean | null;
  detail: string;
  checkedAt: string;
  latencyMs?: number;
};

export interface EmailProvider {
  readonly name: EmailProviderName;
  configured(): boolean;
  health(): Promise<EmailProviderHealth>;
  send(message: EmailMessage): Promise<EmailDeliveryResult>;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function value(name: string) {
  return String(process.env[name] || "").trim();
}

function isPlaceholder(valueToCheck: string) {
  return !valueToCheck || valueToCheck.startsWith("replace-") || valueToCheck.includes("your-");
}

function senderAddress(valueToCheck: string) {
  const match = valueToCheck.match(/<([^>]+)>/);
  return match ? match[1].trim() : valueToCheck.trim();
}

function senderDomain(valueToCheck: string) {
  return senderAddress(valueToCheck).split("@")[1]?.toLowerCase() || "";
}

function providerName(): EmailProviderName {
  const configuredProvider = value("EMAIL_PROVIDER").toLowerCase();
  if (configuredProvider === "resend") return "resend";
  if (configuredProvider === "custom-http") return "custom-http";
  return "disabled";
}

function mode(): EmailMode {
  const configuredMode = value("EMAIL_MODE").toLowerCase();
  return configuredMode === "test" || configuredMode === "production" ? configuredMode : "disabled";
}

function testRecipients() {
  return value("EMAIL_TEST_RECIPIENTS").split(",").map((recipient) => recipient.trim().toLowerCase()).filter(Boolean);
}

export function emailConfiguration() {
  const provider = providerName();
  const deliveryMode = mode();
  const from = value("EMAIL_FROM");
  const apiKey = value("RESEND_API_KEY");
  const endpoint = value("EMAIL_API_URL");
  const legacyKey = value("EMAIL_API_KEY");
  const senderConfigured = !isPlaceholder(from) && emailPattern.test(senderAddress(from));
  const apiConfigured = provider === "resend"
    ? !isPlaceholder(apiKey)
    : provider === "custom-http"
      ? !isPlaceholder(endpoint) && !isPlaceholder(legacyKey)
      : false;
  const safeTestRecipients = testRecipients();
  const testRecipientPolicySatisfied = deliveryMode !== "test" || safeTestRecipients.length > 0;
  const configured = provider !== "disabled" && deliveryMode !== "disabled" && apiConfigured && senderConfigured && testRecipientPolicySatisfied;
  return {
    provider,
    mode: deliveryMode,
    from,
    replyTo: value("EMAIL_REPLY_TO"),
    apiKey,
    endpoint,
    legacyKey,
    senderConfigured,
    apiConfigured,
    safeTestRecipients,
    testRecipientPolicySatisfied,
    configured
  };
}

function baseHealth(detail: string, overrides: Partial<EmailProviderHealth> = {}): EmailProviderHealth {
  const config = emailConfiguration();
  return {
    provider: config.provider,
    mode: config.mode,
    status: config.configured ? "DEGRADED" : "NOT CONFIGURED",
    configured: config.configured,
    senderConfigured: config.senderConfigured,
    senderVerified: config.configured ? null : false,
    detail,
    checkedAt: new Date().toISOString(),
    ...overrides
  };
}

function safeError(status: number, providerMessage: unknown) {
  const message = typeof providerMessage === "string" ? providerMessage.replace(/[\r\n]/g, " ").slice(0, 240) : "Email provider rejected the request.";
  if (status === 429) return { status: "RATE LIMITED" as const, temporaryFailure: true, error: "EMAIL_PROVIDER_RATE_LIMITED" };
  if (status >= 500) return { status: "TEMPORARY FAILURE" as const, temporaryFailure: true, error: "EMAIL_PROVIDER_TEMPORARY_FAILURE" };
  return { status: "PROVIDER REJECTED" as const, temporaryFailure: false, error: message || "EMAIL_PROVIDER_REJECTED" };
}

function recipientsFor(message: EmailMessage) {
  return (Array.isArray(message.to) ? message.to : [message.to]).map((recipient) => String(recipient).trim().toLowerCase());
}

function htmlFromText(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/\r?\n/g, "<br>");
}

class DisabledEmailProvider implements EmailProvider {
  readonly name = "disabled" as const;
  configured() { return false; }
  async health() { return baseHealth("Email delivery is disabled. Configure an approved provider and mode before delivery.", { status: "NOT CONFIGURED", configured: false, senderVerified: false }); }
  async send() { return { delivered: false, accepted: false, state: "FAILED" as const, status: "NOT CONFIGURED" as const, temporaryFailure: false, error: "EMAIL_DELIVERY_DISABLED" }; }
}

class ResendEmailProvider implements EmailProvider {
  readonly name = "resend" as const;
  configured() { return emailConfiguration().configured; }

  async health() {
    const config = emailConfiguration();
    if (config.mode === "disabled") return baseHealth("Email mode is disabled; no external delivery is permitted.", { status: "NOT CONFIGURED", configured: false, senderVerified: false });
    if (!config.apiConfigured) return baseHealth("Resend API key is missing or still a placeholder.", { status: "ACTION REQUIRED", configured: false, senderVerified: false });
    if (!config.senderConfigured) return baseHealth("EMAIL_FROM is missing or still a placeholder.", { status: "ACTION REQUIRED", configured: false, senderVerified: false });
    if (!config.testRecipientPolicySatisfied) return baseHealth("Test mode requires an explicit EMAIL_TEST_RECIPIENTS allowlist.", { status: "ACTION REQUIRED", configured: false, senderVerified: false });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_000);
    const started = Date.now();
    try {
      const response = await fetch("https://api.resend.com/domains", { cache: "no-store", headers: { authorization: `Bearer ${config.apiKey}` }, signal: controller.signal }).catch(() => null);
      if (!response) return baseHealth("Resend read-only domain probe did not respond.", { status: "OFFLINE", configured: true, senderVerified: null, latencyMs: Date.now() - started });
      if (response.status === 401 || response.status === 403) return baseHealth("Resend rejected the configured API key; no delivery was attempted.", { status: "ACTION REQUIRED", configured: false, senderVerified: false, latencyMs: Date.now() - started });
      if (!response.ok) return baseHealth("Resend domain status could not be checked.", { status: "DEGRADED", configured: true, senderVerified: null, latencyMs: Date.now() - started });
      const payload = await response.json().catch(() => ({})) as { data?: Array<{ name?: unknown; status?: unknown }> };
      const domain = (payload.data || []).find((item) => String(item.name || "").toLowerCase() === senderDomain(config.from));
      const verified = String(domain?.status || "").toLowerCase() === "verified";
      return baseHealth(verified ? "Resend API and sender domain are ready for the configured test policy." : "Resend API is reachable, but the configured sender domain is not verified.", { status: verified ? "HEALTHY" : "DEGRADED", configured: true, senderVerified: verified, latencyMs: Date.now() - started });
    } finally {
      clearTimeout(timer);
    }
  }

  async send(message: EmailMessage) {
    const config = emailConfiguration();
    const recipients = recipientsFor(message);
    if (!recipients.length || recipients.some((recipient) => !emailPattern.test(recipient))) return { delivered: false, accepted: false, state: "FAILED" as const, status: "INVALID RECIPIENT" as const, temporaryFailure: false, error: "EMAIL_INVALID_RECIPIENT" };
    if (config.mode === "test" && recipients.some((recipient) => !config.safeTestRecipients.includes(recipient))) return { delivered: false, accepted: false, state: "FAILED" as const, status: "NOT CONFIGURED" as const, temporaryFailure: false, error: "EMAIL_TEST_RECIPIENT_NOT_ALLOWED" };
    if (!config.configured) return { delivered: false, accepted: false, state: "FAILED" as const, status: "NOT CONFIGURED" as const, temporaryFailure: false, error: "EMAIL_PROVIDER_NOT_CONFIGURED" };
    const body = {
      from: message.from || config.from,
      to: recipients,
      subject: message.subject.replace(/[\r\n]/g, " ").slice(0, 180),
      html: message.html || htmlFromText(message.text),
      text: message.text,
      ...(message.replyTo || config.replyTo ? { reply_to: message.replyTo || config.replyTo } : {})
    };
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json", "idempotency-key": message.idempotencyKey },
      body: JSON.stringify(body)
    }).catch(() => null);
    if (!response) return { delivered: false, accepted: false, state: "FAILED" as const, status: "TEMPORARY FAILURE" as const, temporaryFailure: true, error: "EMAIL_PROVIDER_CONNECTION_FAILED" };
    const payload = await response.json().catch(() => ({})) as { id?: unknown; message?: unknown; name?: unknown };
    if (response.ok) return { delivered: false, accepted: true, state: "PROVIDER_ACCEPTED" as const, status: "SUCCESS" as const, providerReference: typeof payload.id === "string" ? payload.id : undefined };
    const failure = safeError(response.status, payload.message || payload.name);
    return { delivered: false, accepted: false, state: "FAILED" as const, status: failure.status, temporaryFailure: failure.temporaryFailure, error: failure.error };
  }
}

class ConfiguredHttpEmailProvider implements EmailProvider {
  readonly name = "custom-http" as const;
  configured() { return emailConfiguration().configured; }
  async health() {
    const config = emailConfiguration();
    return config.configured ? baseHealth("Custom HTTP email endpoint is configured; provider verification is still required.", { configured: true, senderVerified: null }) : baseHealth("Custom HTTP email delivery is not configured.", { status: "NOT CONFIGURED", configured: false, senderVerified: false });
  }
  async send(message: EmailMessage) {
    const config = emailConfiguration();
    const recipients = recipientsFor(message);
    if (!recipients.length || recipients.some((recipient) => !emailPattern.test(recipient))) return { delivered: false, accepted: false, state: "FAILED" as const, status: "INVALID RECIPIENT" as const, temporaryFailure: false, error: "EMAIL_INVALID_RECIPIENT" };
    if (!config.configured) return { delivered: false, accepted: false, state: "FAILED" as const, status: "NOT CONFIGURED" as const, temporaryFailure: false, error: "EMAIL_PROVIDER_NOT_CONFIGURED" };
    const response = await fetch(config.endpoint, { method: "POST", headers: { authorization: `Bearer ${config.legacyKey}`, "content-type": "application/json", "idempotency-key": message.idempotencyKey }, body: JSON.stringify({ from: message.from || config.from, to: recipients, subject: message.subject, html: message.html || htmlFromText(message.text), text: message.text, reply_to: message.replyTo || config.replyTo || undefined }) }).catch(() => null);
    if (!response) return { delivered: false, accepted: false, state: "FAILED" as const, status: "TEMPORARY FAILURE" as const, temporaryFailure: true, error: "EMAIL_PROVIDER_CONNECTION_FAILED" };
    const payload = await response.json().catch(() => ({})) as { id?: unknown; message?: unknown };
    if (response.ok) return { delivered: false, accepted: true, state: "PROVIDER_ACCEPTED" as const, status: "SUCCESS" as const, providerReference: typeof payload.id === "string" ? payload.id : undefined };
    const failure = safeError(response.status, payload.message);
    return { delivered: false, accepted: false, state: "FAILED" as const, status: failure.status, temporaryFailure: failure.temporaryFailure, error: failure.error };
  }
}

export function getEmailProvider(): EmailProvider {
  const provider = providerName();
  if (provider === "resend") return new ResendEmailProvider();
  if (provider === "custom-http") return new ConfiguredHttpEmailProvider();
  return new DisabledEmailProvider();
}

export function renderEmailTemplate(subject: string, body: string, variables: Record<string, unknown>, allowed: string[]) {
  const replace = (value: string) => value.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g, (_, key: string) => allowed.includes(key) ? String(variables[key] ?? "") : "");
  const text = replace(body);
  return { subject: replace(subject).replace(/[\r\n]/g, " "), text, html: htmlFromText(text) };
}
