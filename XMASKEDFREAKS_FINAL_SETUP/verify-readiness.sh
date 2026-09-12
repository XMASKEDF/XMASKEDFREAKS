#!/bin/zsh
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

print "XMASKEDFREAKS readiness check"
print "REPOSITORY=$ROOT"

check_value() {
  local name="$1"
  local value="${(P)name:-}"
  if [[ -z "$value" ]]; then print "$name=MISSING"; return; fi
  if [[ "$value" == *"replace-"* || "$value" == *"REPLACE_ME"* || "$value" == *"your-project"* ]]; then print "$name=INVALID"; return; fi
  print "$name=SET"
}

if [[ "$(node -v 2>/dev/null)" == "v20.20.2" ]]; then print "NODE=SET"; else print "NODE=INVALID"; fi
if command -v corepack >/dev/null 2>&1; then print "COREPACK=SET"; else print "COREPACK=UNAVAILABLE"; fi
if [[ "$(corepack pnpm -v 2>/dev/null)" == "10.12.1" ]]; then print "PNPM=SET"; else print "PNPM=INVALID"; fi
if [[ -w "$ROOT" ]]; then print "REPOSITORY_WRITE=SET"; else print "REPOSITORY_WRITE=UNAVAILABLE"; fi

for name in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY PAYMENT_PROVIDER EMAIL_API_URL EMAIL_API_KEY REDIS_URL CLOUDFLARE_API_TOKEN TURNSTILE_SECRET_KEY STREAMING_PROVIDER STORAGE_ENDPOINT BACKUP_PROVIDER DEPLOYMENT_HEALTH_URL PRINTIFY_API_TOKEN; do
  check_value "$name"
done

if [[ -d "$ROOT/supabase/migrations" ]]; then print "MIGRATIONS=SET"; else print "MIGRATIONS=UNAVAILABLE"; fi
if [[ -f "$ROOT/.next-production/BUILD_ID" ]]; then print "PRODUCTION_BUILD_ID=SET"; else print "PRODUCTION_BUILD_ID=UNAVAILABLE"; fi
if lsof -nP -iTCP:3001 -sTCP:LISTEN >/dev/null 2>&1; then print "PORT_3001=UNAVAILABLE"; else print "PORT_3001=SET"; fi
