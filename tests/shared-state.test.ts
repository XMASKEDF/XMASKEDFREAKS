import assert from "node:assert/strict";
import test from "node:test";
import { LocalMemoryCacheProvider, RedisCompatibleCacheProvider } from "../lib/infrastructure/cache";
import { namespacedStateKey, privateStateKey, sharedStateNamespace } from "../lib/infrastructure/shared-state";

test("shared-state keys are environment segmented and request subjects are opaque", async () => {
  const previous = process.env.XMF_ENVIRONMENT;
  process.env.XMF_ENVIRONMENT = "SANDBOX";
  assert.equal(sharedStateNamespace(), "xmf:sandbox");
  const key = namespacedStateKey("rate-limit", "login:127.0.0.1");
  assert.match(key, /^xmf:sandbox:rate-limit:/);
  assert.match(key, /login:127-0-0-1/);
  const privateKey = await privateStateKey("rate-limit", "login:127.0.0.1");
  assert.match(privateKey, /^xmf:sandbox:rate-limit:[a-f0-9]{64}$/);
  if (previous === undefined) delete process.env.XMF_ENVIRONMENT;
  else process.env.XMF_ENVIRONMENT = previous;
});

test("local cache locks use expiring ownership tokens", async () => {
  const cache = new LocalMemoryCacheProvider();
  const key = namespacedStateKey("lock", "media:one");
  const token = await cache.acquireLock(key, 2);
  assert.ok(token);
  assert.equal(await cache.acquireLock(key, 2), null);
  assert.equal(await cache.releaseLock(key, "wrong-token"), false);
  assert.equal(await cache.releaseLock(key, token!), true);
  assert.ok(await cache.acquireLock(key, 2));
});

test("redis cache treats a remote miss as a miss instead of local fallback data", async () => {
  const originalFetch = globalThis.fetch;
  const commands: string[][] = [];
  globalThis.fetch = (async (_input, init) => {
    const command = JSON.parse(String(init?.body || "[]")) as string[];
    commands.push(command);
    return new Response(JSON.stringify({ result: command[0] === "PING" ? "PONG" : null }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const cache = new RedisCompatibleCacheProvider("https://redis.example", "test-token");
    assert.equal(await cache.get("missing"), null);
    const health = await cache.health();
    assert.equal(health.reachable, true);
    assert.equal(health.status, "HEALTHY");
    assert.deepEqual(commands[0], ["GET", "missing"]);
    assert.deepEqual(commands[1], ["PING"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("redis-compatible providers share counters and token-owned locks across workers", async () => {
  const originalFetch = globalThis.fetch;
  const values = new Map<string, { value: string; expiresAt: number | null }>();
  globalThis.fetch = (async (_input, init) => {
    const command = JSON.parse(String(init?.body || "[]")) as string[];
    const [name, key, rawValue, ...args] = command;
    const current = key ? values.get(key) : undefined;
    if (current?.expiresAt !== null && current && current.expiresAt <= Date.now()) values.delete(key);
    if (name === "PING") return new Response(JSON.stringify({ result: "PONG" }), { status: 200 });
    if (name === "GET") return new Response(JSON.stringify({ result: values.get(key)?.value ?? null }), { status: 200 });
    if (name === "SET") {
      if (args.includes("NX") && values.has(key)) return new Response(JSON.stringify({ result: null }), { status: 200 });
      const ttlIndex = args.indexOf("EX");
      const ttl = ttlIndex >= 0 ? Number(args[ttlIndex + 1]) : null;
      values.set(key, { value: rawValue, expiresAt: ttl ? Date.now() + ttl * 1000 : null });
      return new Response(JSON.stringify({ result: "OK" }), { status: 200 });
    }
    if (name === "INCRBY") {
      const next = Number(values.get(key)?.value || 0) + Number(rawValue);
      values.set(key, { value: String(next), expiresAt: values.get(key)?.expiresAt ?? null });
      return new Response(JSON.stringify({ result: next }), { status: 200 });
    }
    if (name === "EXPIRE") {
      const entry = values.get(key);
      if (!entry) return new Response(JSON.stringify({ result: 0 }), { status: 200 });
      entry.expiresAt = Date.now() + Number(rawValue) * 1000;
      return new Response(JSON.stringify({ result: 1 }), { status: 200 });
    }
    if (name === "EVAL") {
      const lockKey = args[0];
      const token = args[1];
      if (values.get(lockKey)?.value !== token) return new Response(JSON.stringify({ result: 0 }), { status: 200 });
      values.delete(lockKey);
      return new Response(JSON.stringify({ result: 1 }), { status: 200 });
    }
    return new Response(JSON.stringify({ result: null }), { status: 200 });
  }) as typeof fetch;
  try {
    const workerOne = new RedisCompatibleCacheProvider("https://redis.example", "test-token");
    const workerTwo = new RedisCompatibleCacheProvider("https://redis.example", "test-token");
    assert.equal(await workerOne.increment("shared-counter", 1, 60), 1);
    assert.equal(await workerTwo.increment("shared-counter", 1, 60), 2);
    const token = await workerOne.acquireLock("shared-lock", 60);
    assert.ok(token);
    assert.equal(await workerTwo.acquireLock("shared-lock", 60), null);
    assert.equal(await workerTwo.releaseLock("shared-lock", crypto.randomUUID()), false);
    assert.equal(await workerOne.releaseLock("shared-lock", token!), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
