import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFileSync(new URL(path, root), "utf8");

test("Admin route and editable controls remain LTR under a visitor RTL locale", () => {
  const layout = source("app/admin/layout.tsx");
  const css = source("app/globals.css");
  const login = source("app/admin/login/page.tsx");
  assert.match(layout, /className="admin-direction-scope" dir="ltr"/);
  assert.match(css, /\.admin-direction-scope\s*\{[\s\S]*direction:\s*ltr/);
  assert.match(css, /\.admin-direction-scope input:not\(\[type="checkbox"\]\)[\s\S]*unicode-bidi:\s*normal/);
  assert.match(css, /\.admin-direction-scope textarea[\s\S]*writing-mode:\s*horizontal-tb/);
  assert.doesNotMatch(login, /onKeyDown|onKeyPress|onBeforeInput|value=|setSelectionRange|reverse\(/);
});

test("legacy development bypass is rejected and credentials stay server-only", () => {
  const auth = source("lib/admin-auth.ts");
  const bypass = source("lib/admin-dev-bypass.ts");
  const login = source("app/admin/login/page.tsx");
  assert.match(bypass, /ADMIN_DEV_BYPASS is no longer supported/);
  assert.match(auth, /ADMIN_DEV_PASSWORD_HASH/);
  assert.doesNotMatch(login, /Godlovesall64|ustension@gmail\.com/);
  assert.doesNotMatch(auth, /Godlovesall64/);
});

test("admin sessions are hashed, revocable, expiring, and inactivity-aware", () => {
  const auth = source("lib/admin-auth.ts");
  assert.match(auth, /session_token_hash: hashToken\(token\)/);
  assert.match(auth, /last_activity_at/);
  assert.match(auth, /inactivity_timeout_minutes/);
  assert.match(auth, /revokeAdminSession/);
  assert.match(source("app/api/admin/logout/route.ts"), /revokeAllAdminSessions/);
});

test("email 2FA uses hashed single-use expiring challenges", () => {
  const auth = source("lib/admin-auth.ts");
  const migration = source("supabase/migrations/20260729090000_secure_admin_control_center.sql");
  assert.match(auth, /randomInt\(100000, 1000000\)/);
  assert.match(auth, /code_hash: await bcrypt\.hash/);
  assert.match(auth, /challenge\.used_at/);
  assert.match(auth, /challenge\.expires_at/);
  assert.match(migration, /admin_login_challenges/);
  assert.match(migration, /email_two_factor_enabled boolean not null default false/);
});

test("first setup and future permissions remain server-authoritative", () => {
  const auth = source("lib/admin-auth.ts");
  assert.match(auth, /first_setup_completed/);
  assert.match(auth, /admin\.security\.manage/);
  assert.match(auth, /SUPER_ADMIN/);
  assert.match(source("app/api/admin/first-setup/route.ts"), /getAdminBySession/);
  assert.match(source("app/api/admin/security/route.ts"), /hasAdminPermission/);
});

test("sandbox and admin APIs require an administrator session", () => {
  const middleware = source("middleware.ts");
  const sandbox = source("app/sandbox/page.tsx");
  assert.match(middleware, /pathname === "\/sandbox"/);
  assert.match(middleware, /pathname\.startsWith\("\/api\/admin"\)/);
  assert.match(middleware, /request\.headers\.get\("origin"\)/);
  assert.match(middleware, /noindex, nofollow, noarchive/);
  assert.match(sandbox, /getAdminBySession/);
  assert.match(sandbox, /redirect\("\/admin\/login"\)/);
});
