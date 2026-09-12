import type { InfrastructureStatus, ProviderKind } from "./types";

export type CacheHealth = {
  provider: ProviderKind;
  configured: boolean;
  reachable: boolean | null;
  status: InfrastructureStatus;
  detail: string;
  latencyMs: number | null;
  checkedAt: string;
};

export interface CacheProvider {
  readonly kind: ProviderKind;
  readonly shared: boolean;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  increment(key: string, amount?: number, ttlSeconds?: number): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<boolean>;
  acquireLock(key: string, ttlSeconds: number): Promise<string | null>;
  releaseLock(key: string, token: string): Promise<boolean>;
  health(): Promise<CacheHealth>;
  stats(): { hitCount: number; missCount: number; keys: number };
}

type Entry = { value: unknown; expiresAt: number | null };

export class LocalMemoryCacheProvider implements CacheProvider {
  readonly kind = "LOCAL" as const;
  readonly shared = false;
  private readonly entries = new Map<string, Entry>();
  private hits = 0;
  private misses = 0;

  private read(key: string) {
    const entry = this.entries.get(key);
    if (!entry || (entry.expiresAt !== null && entry.expiresAt <= Date.now())) {
      this.entries.delete(key);
      this.misses += 1;
      return null;
    }
    this.hits += 1;
    return entry;
  }
  async get<T>(key: string) { return (this.read(key)?.value as T | undefined) ?? null; }
  async set<T>(key: string, value: T, ttlSeconds?: number) { this.entries.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null }); }
  async delete(key: string) { this.entries.delete(key); }
  async increment(key: string, amount = 1, ttlSeconds?: number) {
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= Date.now()) this.entries.delete(key);
    const current = Number(this.entries.get(key)?.value || 0);
    const next = current + amount;
    this.entries.set(key, { value: next, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : this.entries.get(key)?.expiresAt || null });
    return next;
  }
  async expire(key: string, ttlSeconds: number) {
    const entry = this.entries.get(key);
    if (!entry) return false;
    entry.expiresAt = Date.now() + Math.max(1, ttlSeconds) * 1000;
    return true;
  }
  async acquireLock(key: string, ttlSeconds: number) {
    const current = this.entries.get(key);
    if (current && (current.expiresAt === null || current.expiresAt > Date.now())) return null;
    if (current) this.entries.delete(key);
    const token = crypto.randomUUID();
    this.entries.set(key, { value: token, expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000 });
    return token;
  }
  async releaseLock(key: string, token: string) {
    const current = this.entries.get(key);
    if (!current || current.value !== token) return false;
    this.entries.delete(key);
    return true;
  }
  async health(): Promise<CacheHealth> {
    return { provider: this.kind, configured: true, reachable: true, status: "HEALTHY", detail: "Local cache adapter is available for development and single-process tests.", latencyMs: 0, checkedAt: new Date().toISOString() };
  }
  stats() { return { hitCount: this.hits, missCount: this.misses, keys: this.entries.size }; }
}

type RedisResponse = { result?: unknown; error?: string };
type CommandResult<T> =
  | { ok: true; value: T | null; latencyMs: number }
  | { ok: false; error: string; latencyMs: number };

export class RedisCompatibleCacheProvider implements CacheProvider {
  readonly kind = "REDIS_COMPATIBLE" as const;
  readonly shared = true;
  private readonly fallback = new LocalMemoryCacheProvider();
  private hits = 0;
  private misses = 0;
  private errors = 0;
  private lastError: string | null = null;
  constructor(private readonly endpoint: string, private readonly token: string) {}

  private async command<T>(...command: Array<string | number>): Promise<CommandResult<T>> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);
    try {
      const response = await fetch(this.endpoint, { method: "POST", signal: controller.signal, headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" }, body: JSON.stringify(command.map(String)) }).catch(() => null);
      if (!response?.ok) return this.commandFailure(`HTTP_${response?.status || "NO_RESPONSE"}`, startedAt);
      const payload = await response.json().catch(() => ({})) as RedisResponse;
      if (payload.error) return this.commandFailure(payload.error.slice(0, 160), startedAt);
      return { ok: true, value: (payload.result as T | null | undefined) ?? null, latencyMs: Date.now() - startedAt };
    } finally {
      clearTimeout(timeout);
    }
  }

  private commandFailure(error: string, startedAt: number): CommandResult<never> {
    this.errors += 1;
    this.lastError = error;
    return { ok: false, error, latencyMs: Date.now() - startedAt };
  }

  async get<T>(key: string) {
    const result = await this.command<unknown>("GET", key);
    if (!result.ok) { this.misses += 1; return this.fallback.get<T>(key); }
    if (result.value === null) { this.misses += 1; return null; }
    this.hits += 1;
    if (typeof result.value === "string") { try { return JSON.parse(result.value) as T; } catch { return result.value as T; } }
    return result.value as T;
  }
  async set<T>(key: string, value: T, ttlSeconds?: number) {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    const result = await this.command("SET", key, serialized, ...(ttlSeconds ? ["EX", Math.max(1, ttlSeconds)] : []));
    if (!result.ok) return this.fallback.set(key, value, ttlSeconds);
  }
  async delete(key: string) {
    const result = await this.command("DEL", key);
    if (!result.ok) await this.fallback.delete(key);
  }
  async increment(key: string, amount = 1, ttlSeconds?: number) {
    const result = await this.command<number>("INCRBY", key, amount);
    if (!result.ok || result.value === null) return this.fallback.increment(key, amount, ttlSeconds);
    const count = Number(result.value);
    if (count === amount && ttlSeconds) {
      const expiry = await this.command("EXPIRE", key, Math.max(1, ttlSeconds));
      if (!expiry.ok) {
        await this.command("DEL", key);
        return this.fallback.increment(key, amount, ttlSeconds);
      }
    }
    return Number.isFinite(count) ? count : this.fallback.increment(key, amount, ttlSeconds);
  }
  async expire(key: string, ttlSeconds: number) {
    const result = await this.command<number>("EXPIRE", key, Math.max(1, ttlSeconds));
    if (!result.ok) return this.fallback.expire(key, ttlSeconds);
    return Number(result.value) === 1;
  }
  async acquireLock(key: string, ttlSeconds: number) {
    const token = crypto.randomUUID();
    const result = await this.command("SET", key, token, "NX", "EX", Math.max(1, ttlSeconds));
    if (!result.ok) return this.fallback.acquireLock(key, ttlSeconds);
    return result.value === "OK" ? token : null;
  }
  async releaseLock(key: string, token: string) {
    const releaseScript = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
    const result = await this.command<number>("EVAL", releaseScript, 1, key, token);
    if (!result.ok) return this.fallback.releaseLock(key, token);
    return Number(result.value) === 1;
  }
  async health(): Promise<CacheHealth> {
    const result = await this.command<string>("PING");
    return {
      provider: this.kind,
      configured: true,
      reachable: result.ok,
      status: result.ok ? "HEALTHY" : "DEGRADED",
      detail: result.ok ? "Redis-compatible shared state responded to a bounded health probe." : `Redis-compatible shared state is unavailable (${this.lastError || "provider_error"}); local fallback is active for optional cache operations.`,
      latencyMs: result.latencyMs,
      checkedAt: new Date().toISOString()
    };
  }
  stats() { const fallback = this.fallback.stats(); return { hitCount: this.hits + fallback.hitCount, missCount: this.misses + fallback.missCount, keys: fallback.keys }; }
  errorCount() { return this.errors; }
}

let cache: CacheProvider | null = null;
export function getCacheProvider() {
  if (cache) return cache;
  const provider = String(process.env.CACHE_PROVIDER || "LOCAL").toUpperCase();
  const endpoint = process.env.REDIS_REST_URL || (process.env.REDIS_URL?.startsWith("https://") ? process.env.REDIS_URL : "");
  const token = process.env.REDIS_TOKEN || "";
  cache = provider === "REDIS_COMPATIBLE" && endpoint && token ? new RedisCompatibleCacheProvider(endpoint, token) : new LocalMemoryCacheProvider();
  return cache;
}

export function cacheConfiguration() {
  const requestedProvider = String(process.env.CACHE_PROVIDER || "LOCAL").toUpperCase();
  const endpoint = process.env.REDIS_REST_URL || (process.env.REDIS_URL?.startsWith("https://") ? process.env.REDIS_URL : "");
  const token = process.env.REDIS_TOKEN || "";
  return {
    requestedProvider,
    endpointConfigured: Boolean(endpoint),
    tokenConfigured: Boolean(token),
    configured: requestedProvider === "LOCAL" || (requestedProvider === "REDIS_COMPATIBLE" && Boolean(endpoint && token))
  };
}
