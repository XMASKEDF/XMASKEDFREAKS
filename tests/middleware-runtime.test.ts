import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { config, middleware } from "../middleware";

const optionalEnvironment = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CACHE_PROVIDER",
  "REDIS_REST_URL",
  "REDIS_URL",
  "REDIS_TOKEN",
  "ADMIN_DEV_AUTH_ENABLED",
  "ADMIN_DEV_BYPASS",
  "TURNSTILE_MODE",
  "TURNSTILE_SITE_KEY",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "TURNSTILE_SECRET_KEY"
];

async function invoke(pathname: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return middleware(new NextRequest(`https://review.example${pathname}`, init));
}

test("public middleware routes remain available without optional provider configuration", async () => {
  const previous = new Map(optionalEnvironment.map((name) => [name, process.env[name]]));
  try {
    for (const name of optionalEnvironment) delete process.env[name];
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";

    for (const pathname of ["/", "/live", "/account", "/merch", "/api/health"]) {
      const response = await invoke(pathname, { headers: { "user-agent": "browser" } });
      assert.equal(response.status, 200, pathname);
    }

    const admin = await invoke("/admin", { headers: { "user-agent": "browser" } });
    assert.equal(admin.status, 307);
    assert.equal(admin.headers.get("location"), "https://review.example/admin/login");

    const login = await invoke("/admin/login", { headers: { "user-agent": "browser" } });
    assert.equal(login.status, 200);

    const callback = await invoke("/api/webhooks/payments/ccbill", { method: "POST", headers: { "user-agent": "provider" } });
    assert.equal(callback.status, 200);
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("middleware matcher excludes Next internals and public assets", () => {
  const matcher = JSON.stringify(config.matcher);
  assert.match(matcher, /_next\/static/);
  assert.match(matcher, /_next\/image/);
  assert.match(matcher, /favicon\.ico/);
  assert.match(matcher, /assets/);
});

test("malformed optional provider values fall back without crashing public routing", async () => {
  const previous = new Map(["CACHE_PROVIDER", "REDIS_REST_URL", "REDIS_TOKEN", "TURNSTILE_MODE"].map((name) => [name, process.env[name]]));
  try {
    process.env.CACHE_PROVIDER = "REDIS_COMPATIBLE";
    process.env.REDIS_REST_URL = "not-a-url";
    process.env.REDIS_TOKEN = "test-token";
    process.env.TURNSTILE_MODE = "unexpected";
    const response = await invoke("/live", { headers: { "user-agent": "browser" } });
    assert.equal(response.status, 200);
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
