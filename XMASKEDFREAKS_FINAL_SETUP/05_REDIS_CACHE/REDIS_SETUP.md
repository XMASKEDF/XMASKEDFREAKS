# Redis / Cache Setup

The project uses a local in-memory fallback and a Redis-compatible adapter when `CACHE_PROVIDER=REDIS_COMPATIBLE` with `REDIS_REST_URL` and `REDIS_TOKEN`. Local cache is not the database source of truth.

Production uses should be evaluated for rate-limit counters, short-lived state where explicitly wired, catalog/cache reads, leaderboard acceleration, and live state. Durable wallet, order, payment, entitlement, and audit records remain in the database.

Verify connectivity, TTL behavior, failure fallback, namespace isolation, and no sensitive values in keys/logs before enabling it.
