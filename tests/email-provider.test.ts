import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { emailConfiguration, getEmailProvider, renderEmailTemplate } from "../lib/email/provider.ts";

const envKeys = ["EMAIL_PROVIDER", "EMAIL_MODE", "EMAIL_FROM", "EMAIL_REPLY_TO", "RESEND_API_KEY", "EMAIL_TEST_RECIPIENTS", "EMAIL_API_URL", "EMAIL_API_KEY"];
const originalFetch = globalThis.fetch;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

async function withEnv(values: Record<string, string | undefined>, callback: () => Promise<void>) {
  for (const key of envKeys) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  try { await callback(); } finally {
    for (const key of envKeys) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    globalThis.fetch = originalFetch;
  }
}

function message() {
  return { to: "safe@example.com", subject: "Hello", text: "Safe body", idempotencyKey: "email-test-idempotency-001" };
}

test("disabled mode fails closed without attempting delivery", async () => {
  await withEnv({ EMAIL_PROVIDER: "disabled", EMAIL_MODE: "disabled" }, async () => {
    let calls = 0;
    globalThis.fetch = (async () => { calls += 1; return new Response(); }) as typeof fetch;
    const provider = getEmailProvider();
    assert.equal(provider.name, "disabled");
    assert.equal(provider.configured(), false);
    assert.equal((await provider.send(message())).status, "NOT CONFIGURED");
    assert.equal(calls, 0);
    assert.equal((await provider.health()).status, "NOT CONFIGURED");
  });
});

test("Resend configuration requires a server key, sender, and safe test recipient policy", async () => {
  await withEnv({ EMAIL_PROVIDER: "resend", EMAIL_MODE: "test", EMAIL_FROM: "XMASKEDFREAKS <noreply@example.com>", RESEND_API_KEY: undefined, EMAIL_TEST_RECIPIENTS: "safe@example.com" }, async () => {
    const health = await getEmailProvider().health();
    assert.equal(health.status, "ACTION REQUIRED");
    assert.equal((await getEmailProvider().send(message())).status, "NOT CONFIGURED");
  });
  await withEnv({ EMAIL_PROVIDER: "resend", EMAIL_MODE: "test", EMAIL_FROM: "XMASKEDFREAKS <noreply@example.com>", RESEND_API_KEY: "re_test_key", EMAIL_TEST_RECIPIENTS: undefined }, async () => {
    const health = await getEmailProvider().health();
    assert.equal(health.status, "ACTION REQUIRED");
    assert.equal(emailConfiguration().testRecipientPolicySatisfied, false);
  });
});

test("Resend configuration rejects malformed sender addresses", async () => {
  await withEnv({ EMAIL_PROVIDER: "resend", EMAIL_MODE: "test", EMAIL_FROM: "XMASKEDFREAKS", RESEND_API_KEY: "re_test_key", EMAIL_TEST_RECIPIENTS: "safe@example.com" }, async () => {
    const provider = getEmailProvider();
    assert.equal(provider.configured(), false);
    assert.equal((await provider.health()).status, "ACTION REQUIRED");
  });
});

test("configured Resend adapter sends the official payload with idempotency and no secret in output", async () => {
  await withEnv({ EMAIL_PROVIDER: "resend", EMAIL_MODE: "test", EMAIL_FROM: "XMASKEDFREAKS <noreply@example.com>", EMAIL_REPLY_TO: "support@example.com", RESEND_API_KEY: "re_test_secret_value", EMAIL_TEST_RECIPIENTS: "safe@example.com" }, async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), init: init || {} };
      return new Response(JSON.stringify({ id: "resend-message-123" }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const result = await getEmailProvider().send(message());
    assert.equal(result.status, "SUCCESS");
    assert.equal(result.providerReference, "resend-message-123");
    assert.ok(captured);
    const capturedRequest = captured as { url: string; init: RequestInit };
    assert.equal(capturedRequest.url, "https://api.resend.com/emails");
    const headers = capturedRequest.init.headers as Record<string, string>;
    assert.equal(headers["idempotency-key"], message().idempotencyKey);
    assert.equal(headers.authorization, "Bearer re_test_secret_value");
    const payload = JSON.parse(String(capturedRequest.init.body));
    assert.deepEqual(payload.to, ["safe@example.com"]);
    assert.equal(payload.from, "XMASKEDFREAKS <noreply@example.com>");
    assert.equal(payload.reply_to, "support@example.com");
    assert.match(payload.html, /Safe body/);
    assert.doesNotMatch(JSON.stringify(result), /re_test_secret_value/);
  });
});

test("test mode blocks recipients outside the explicit allowlist", async () => {
  await withEnv({ EMAIL_PROVIDER: "resend", EMAIL_MODE: "test", EMAIL_FROM: "XMASKEDFREAKS <noreply@example.com>", RESEND_API_KEY: "re_test_key", EMAIL_TEST_RECIPIENTS: "safe@example.com" }, async () => {
    let calls = 0;
    globalThis.fetch = (async () => { calls += 1; return new Response(); }) as typeof fetch;
    const result = await getEmailProvider().send({ ...message(), to: "arbitrary@example.com" });
    assert.equal(result.status, "NOT CONFIGURED");
    assert.equal(calls, 0);
  });
});

test("provider failures are classified without exposing provider internals", async () => {
  await withEnv({ EMAIL_PROVIDER: "resend", EMAIL_MODE: "test", EMAIL_FROM: "XMASKEDFREAKS <noreply@example.com>", RESEND_API_KEY: "re_test_key", EMAIL_TEST_RECIPIENTS: "safe@example.com" }, async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ message: "secret provider detail" }), { status: 429 })) as typeof fetch;
    const result = await getEmailProvider().send(message());
    assert.equal(result.status, "RATE LIMITED");
    assert.equal(result.temporaryFailure, true);
    assert.doesNotMatch(JSON.stringify(result), /secret provider detail/);
  });
});

test("templates provide escaped HTML and plain-text output through one renderer", () => {
  const rendered = renderEmailTemplate("Hello {{name}}", "Hi {{name}} <script>{{notAllowed}}</script>", { name: "<Admin>" }, ["name"]);
  assert.equal(rendered.text, "Hi <Admin> <script></script>");
  assert.match(rendered.html, /&lt;Admin&gt;/);
  assert.doesNotMatch(rendered.html, /<script>/);
});

test("email delivery has one server-side provider path and the worker remains queue-backed", async () => {
  const [provider, worker, config] = await Promise.all([
    readFile(new URL("../lib/email/provider.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/jobs/email/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8")
  ]);
  assert.match(provider, /class ResendEmailProvider/);
  assert.match(worker, /getEmailProvider/);
  assert.match(worker, /provider\.send/);
  assert.match(worker, /\.\.\.rendered/);
  assert.doesNotMatch(worker, /api\.resend\.com/);
  assert.match(config, /^EMAIL_PROVIDER=disabled$/m);
  assert.match(config, /^EMAIL_MODE=disabled$/m);
  assert.match(config, /^RESEND_API_KEY=$/m);
  assert.doesNotMatch(config, /NEXT_PUBLIC_RESEND_API_KEY/);
});
